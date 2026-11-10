-- Test for push notifications in the database (0007_push.sql): which changes call the
-- push function, that nothing else does, that a write never fails because of it, and
-- who may manage which device's subscription.
--
-- Run it in the Supabase SQL editor, or locally with supabase/tests/local/run.sh push.
-- It builds a throwaway second kitchen with three throwaway logins, plays through the
-- five events, then ROLLS EVERYTHING BACK by ending with an exception whose message is
-- the report. "FAIL" lines mean something is wrong.
--
-- Safe next to a real kitchen: it touches only its own rows, and nothing is ever sent.
-- pg_net delivers after a commit, and this never commits. While it runs it points the
-- push settings at an address that does not exist; the rollback restores the real ones.

do $$
declare
  u1 uuid := gen_random_uuid(); -- Ana's phone (she cooks)
  u2 uuid := gen_random_uuid(); -- Ben's phone (he eats)
  u3 uuid := gen_random_uuid(); -- Ben's tablet
  u4 uuid := gen_random_uuid(); -- a stranger
  hh uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  dish uuid := gen_random_uuid();
  meal uuid := gen_random_uuid();
  quiet uuid := gen_random_uuid();
  r1 uuid := gen_random_uuid();
  r2 uuid := gen_random_uuid();
  target constant text := 'https://push-test.invalid/functions/v1/push';
  secret constant text := 'test-secret-0123456789-0123456789-0123456789';
  ep_phone constant text := 'https://push-test.invalid/send/bens-phone';
  ep_tablet constant text := 'https://push-test.invalid/send/bens-tablet';
  ep_new constant text := 'https://push-test.invalid/send/bens-phone-renewed';
  seen integer := 0;
  n integer;
  b boolean;
  txt text;
  ev jsonb;
  hdr jsonb;
  report text[] := '{}';
begin
  insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at) values
    (u1, 'authenticated', 'authenticated', true, now(), now()),
    (u2, 'authenticated', 'authenticated', true, now(), now()),
    (u3, 'authenticated', 'authenticated', true, now(), now()),
    (u4, 'authenticated', 'authenticated', true, now(), now());
  insert into public.households (id, name) values (hh, 'Push test kitchen');
  insert into public.members (id, household_id, name, default_role, is_admin) values
    (m1, hh, 'Ana Pushtest', 'chef', true),
    (m2, hh, 'Ben Pushtest', 'taster', false);
  insert into private.member_devices (user_id, member_id) values (u1, m1), (u2, m2), (u3, m2);
  insert into public.dishes (id, household_id, name, created_by) values (dish, hh, 'Lasagne', m1);

  -- ---- without settings the triggers do nothing
  delete from private.push_config;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  insert into public.servings (id, household_id, dish_id, proposed_by, cooked_by, status) values (quiet, hh, dish, m1, m1, 'wishlist');
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  select count(*) into seen from public.servings where id = quiet;
  report := report || format('%s 01 no settings row: the proposal is saved (%s) and nothing is sent (%s)', case when n = 0 and seen = 1 then 'ok  ' else 'FAIL' end, seen, n);

  insert into private.push_config (function_url, secret) values (target, secret);
  seen := 0;

  -- ---- proposed
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  insert into public.servings (id, household_id, dish_id, proposed_by, cooked_by, status) values (meal, hh, dish, m1, m1, 'wishlist');
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  select convert_from(body, 'UTF8')::jsonb, headers into ev, hdr from net.http_request_queue where url = target order by id desc limit 1;
  report := report || format('%s 02 proposing calls the function once (%s) with type, kitchen, actor and meal (%s)',
    case when n = seen + 1 and ev = jsonb_build_object('type', 'proposed', 'household_id', hh, 'actor_id', m1, 'serving_id', meal, 'review_id', null) then 'ok  ' else 'FAIL' end, n - seen, ev ->> 'type');
  report := report || format('%s 03 the call carries the shared secret and is JSON', case when hdr ->> 'x-push-secret' = secret and hdr ->> 'Content-Type' = 'application/json' then 'ok  ' else 'FAIL' end);
  seen := n;

  -- ---- ordinary edits are not events
  execute 'set local role authenticated';
  update public.servings set note = 'Extra cheese', craving = 5, priority = 'a1', suggested_days = '{2026-11-14}' where id = meal;
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  report := report || format('%s 04 a note, a craving and a new place in the order send nothing (%s)', case when n = seen then 'ok  ' else 'FAIL' end, n - seen);

  -- ---- planned (by the eater this time: the actor is whoever did it)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  update public.servings set status = 'planned', planned_date = current_date + 2, planned_slot = 'dinner' where id = meal;
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  select convert_from(body, 'UTF8')::jsonb into ev from net.http_request_queue where url = target order by id desc limit 1;
  report := report || format('%s 05 planning sends "planned" once, from whoever planned (%s, %s)', case when n = seen + 1 and ev ->> 'type' = 'planned' and (ev ->> 'actor_id')::uuid = m2 then 'ok  ' else 'FAIL' end, n - seen, ev ->> 'type');
  seen := n;

  execute 'set local role authenticated';
  update public.servings set planned_date = current_date + 3 where id = meal;
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  report := report || format('%s 06 moving a planned meal to another day sends nothing (%s)', case when n = seen then 'ok  ' else 'FAIL' end, n - seen);

  -- ---- served, taken back, served again
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  update public.servings set status = 'served', served_at = now() where id = meal;
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  select convert_from(body, 'UTF8')::jsonb into ev from net.http_request_queue where url = target order by id desc limit 1;
  report := report || format('%s 07 "Served" sends "served" once (%s, %s)', case when n = seen + 1 and ev ->> 'type' = 'served' and (ev ->> 'actor_id')::uuid = m1 then 'ok  ' else 'FAIL' end, n - seen, ev ->> 'type');
  seen := n;

  execute 'set local role authenticated';
  update public.servings set status = 'planned', served_at = null where id = meal;
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  report := report || format('%s 08 taking "Served" back sends nothing (%s)', case when n = seen then 'ok  ' else 'FAIL' end, n - seen);

  execute 'set local role authenticated';
  update public.servings set status = 'served', served_at = now() where id = meal;
  update public.servings set proof_photos = '[{"photoId":"x"}]'::jsonb where id = meal;
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  report := report || format('%s 09 serving again sends once more, the proof photo sends nothing (%s)', case when n = seen + 1 then 'ok  ' else 'FAIL' end, n - seen);
  seen := n;

  -- ---- the verdict
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  insert into public.reviews (id, household_id, serving_id, dish_id, reviewer_id, reaction) values
    (r1, hh, meal, dish, m2, 6),
    (r2, hh, meal, dish, m2, 5);
  update public.reviews set overall = 5, comment = 'So good' where id = r1;
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  report := report || format('%s 10 writing and editing a verdict sends nothing yet (%s)', case when n = seen then 'ok  ' else 'FAIL' end, n - seen);

  execute 'set local role authenticated';
  update public.servings set status = 'eaten', eaten_at = now() where id = meal;
  update public.servings set eaten_at = now() - interval '5 minutes' where id = meal;
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  select convert_from(body, 'UTF8')::jsonb into ev from net.http_request_queue where url = target order by id desc limit 1;
  report := report || format('%s 11 handing in the verdict sends "reviewed" once, from the eater (%s, %s)', case when n = seen + 1 and ev ->> 'type' = 'reviewed' and (ev ->> 'actor_id')::uuid = m2 then 'ok  ' else 'FAIL' end, n - seen, ev ->> 'type');
  seen := n;

  -- ---- the cook's answer: one per meal for the face, one for the words
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  update public.reviews set chef_self_rating = 4 where id in (r1, r2);
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  report := report || format('%s 12 the cook''s guess sends nothing (%s)', case when n = seen then 'ok  ' else 'FAIL' end, n - seen);

  execute 'set local role authenticated';
  update public.reviews set chef_reaction = 6 where id = r1;
  update public.reviews set chef_reaction = 6 where id = r2;
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  select convert_from(body, 'UTF8')::jsonb into ev from net.http_request_queue where url = target order by id desc limit 1;
  report := report || format('%s 13 a face on both courses of a menu is one answer: "replied" once, naming meal and verdict (%s, %s)',
    case when n = seen + 1 and ev = jsonb_build_object('type', 'replied', 'household_id', hh, 'actor_id', m1, 'serving_id', meal, 'review_id', r1) then 'ok  ' else 'FAIL' end, n - seen, ev ->> 'type');
  seen := n;

  execute 'set local role authenticated';
  update public.reviews set chef_reply = 'Glad you liked it' where id = r1;
  update public.reviews set chef_reply = 'Glad you liked it' where id = r2;
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  report := report || format('%s 14 the words, on both courses, send once more (%s)', case when n = seen + 1 then 'ok  ' else 'FAIL' end, n - seen);
  seen := n;

  execute 'set local role authenticated';
  update public.reviews set chef_reply = 'Glad you loved it', chef_reaction = 5, chef_extra_reactions = '{love}' where id in (r1, r2);
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  report := report || format('%s 15 changing the answer afterwards sends nothing (%s)', case when n = seen then 'ok  ' else 'FAIL' end, n - seen);

  -- ---- changes from outside the app have nobody to name
  perform set_config('request.jwt.claims', '', true);
  insert into public.servings (household_id, dish_id, proposed_by, status) values (hh, dish, m1, 'wishlist');
  select count(*) into n from net.http_request_queue where url = target;
  report := report || format('%s 16 a change made from the SQL editor sends nothing (%s)', case when n = seen then 'ok  ' else 'FAIL' end, n - seen);

  -- ---- a deleted meal is not announced
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  update public.servings set status = 'planned', deleted_at = now() where id = quiet;
  execute 'reset role';
  select count(*) into n from net.http_request_queue where url = target;
  report := report || format('%s 17 a meal that is deleted in the same breath sends nothing (%s)', case when n = seen then 'ok  ' else 'FAIL' end, n - seen);

  -- ---- a failing call never makes a write fail (only checkable against the stand-in)
  if to_regprocedure('net.is_stand_in()') is not null then
    update private.push_config set function_url = 'https://push-test.invalid/explode';
    execute 'set local role authenticated';
    begin
      insert into public.servings (household_id, dish_id, proposed_by, status) values (hh, dish, m1, 'wishlist');
      get diagnostics n = row_count;
      report := report || format('%s 18 when the call itself fails, the write still goes through (%s row)', case when n = 1 then 'ok  ' else 'FAIL' end, n);
    exception when others then
      report := report || format('FAIL 18 a failing call made the write fail (%s)', sqlerrm);
    end;
    execute 'reset role';
    update private.push_config set function_url = target;
  else
    report := report || text 'ok   18 (skipped here: a failing call can only be staged against the local stand-in)';
  end if;

  -- ---- subscriptions: each device manages its own
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.save_push_subscription(ep_phone, 'BPublicKey', 'AuthSecret', array['served', 'nonsense', 'served'], 'Test phone');
  execute 'reset role';
  select count(*), bool_and(member_id = m2 and user_id = u2 and household_id = hh and muted_types = array['served']) into n, b from public.push_subscriptions where endpoint = ep_phone;
  report := report || format('%s 19 a device signs up: one row, tied to profile and login, unknown kinds dropped (%s, %s)', case when n = 1 and b then 'ok  ' else 'FAIL' end, n, b);

  execute 'set local role authenticated';
  begin
    select count(*) into n from public.push_subscriptions;
    report := report || format('FAIL 20 the app can read the subscriptions table directly (%s rows)', n);
  exception when others then
    report := report || format('ok   20 the table itself is closed to the app (%s)', sqlstate);
  end;
  begin
    insert into public.push_subscriptions (household_id, member_id, endpoint, p256dh, auth) values (hh, m2, 'https://push-test.invalid/send/sneaky', 'k', 'a');
    report := report || text 'FAIL 21 the app can insert a subscription directly';
  exception when others then
    report := report || format('ok   21 direct inserts are refused (%s)', sqlstate);
  end;

  perform public.set_push_muted(ep_phone, array['replied', 'proposed']);
  execute 'reset role';
  select muted_types into txt from public.push_subscriptions where endpoint = ep_phone;
  report := report || format('%s 22 muting is saved, in the usual order (%s)', case when txt = '{proposed,replied}' then 'ok  ' else 'FAIL' end, txt);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  begin
    perform public.set_push_muted(ep_phone, array['served']);
    report := report || text 'FAIL 23 the partner could mute my device';
  exception when others then
    report := report || format('%s 23 the partner cannot mute my device (%s)', case when sqlerrm = 'push_missing' then 'ok  ' else 'FAIL' end, sqlerrm);
  end;
  perform public.remove_push_subscription(ep_phone);
  execute 'reset role';
  select count(*) into n from public.push_subscriptions where endpoint = ep_phone;
  report := report || format('%s 24 the partner cannot remove my device (%s row left)', case when n = 1 then 'ok  ' else 'FAIL' end, n);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  begin
    perform public.save_push_subscription('https://push-test.invalid/send/stranger', 'k', 'a');
    report := report || text 'FAIL 25 a stranger could sign up for notifications';
  exception when others then
    report := report || format('%s 25 a stranger cannot sign up (%s)', case when sqlerrm = 'not_in_kitchen' then 'ok  ' else 'FAIL' end, sqlerrm);
  end;
  begin
    perform public.set_push_muted(ep_phone, array['served']);
    report := report || text 'FAIL 26 a stranger could mute a device';
  exception when others then
    report := report || format('%s 26 a stranger cannot mute a device (%s)', case when sqlerrm = 'not_in_kitchen' then 'ok  ' else 'FAIL' end, sqlerrm);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  begin
    perform public.save_push_subscription('http://push-test.invalid/not-https', 'k', 'a');
    report := report || text 'FAIL 27 an address that is not https was accepted';
  exception when others then
    report := report || format('%s 27 an address that is not https is refused (%s)', case when sqlerrm = 'push_invalid' then 'ok  ' else 'FAIL' end, sqlerrm);
  end;

  -- The browser swapped the subscription for a new one: the old row goes.
  perform public.save_push_subscription(ep_new, 'BPublicKey2', 'AuthSecret2', '{}', 'Test phone');
  execute 'reset role';
  select count(*), bool_and(endpoint = ep_new) into n, b from public.push_subscriptions where user_id = u2;
  report := report || format('%s 28 a renewed subscription replaces the device''s old one (%s row, new address: %s)', case when n = 1 and b then 'ok  ' else 'FAIL' end, n, b);

  -- The same browser, now used by the other person: the row changes hands.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform public.save_push_subscription(ep_new, 'BPublicKey2', 'AuthSecret2', array['planned'], 'Shared browser');
  execute 'reset role';
  select count(*), bool_and(member_id = m1 and user_id = u1) into n, b from public.push_subscriptions where endpoint = ep_new;
  report := report || format('%s 29 one browser, one row: it belongs to whoever is logged in on it now (%s row, hers: %s)', case when n = 1 and b then 'ok  ' else 'FAIL' end, n, b);

  execute 'set local role authenticated';
  perform public.remove_push_subscription(ep_new);
  perform public.remove_push_subscription(ep_new);
  execute 'reset role';
  select count(*) into n from public.push_subscriptions where household_id = hh;
  report := report || format('%s 30 removing works, and removing twice is not an error (%s rows left)', case when n = 0 then 'ok  ' else 'FAIL' end, n);

  -- ---- logging out takes the notifications along
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.save_push_subscription(ep_phone, 'BPublicKey', 'AuthSecret');
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform public.save_push_subscription(ep_tablet, 'BPublicKey3', 'AuthSecret3');
  perform public.sign_out_device();
  execute 'reset role';
  select count(*) filter (where endpoint = ep_tablet), count(*) filter (where endpoint = ep_phone) into n, seen from public.push_subscriptions;
  report := report || format('%s 31 logging a device out removes its subscription (%s) and leaves the other device''s (%s)', case when n = 0 and seen = 1 then 'ok  ' else 'FAIL' end, n, seen);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform public.sign_out_member(m2);
  execute 'reset role';
  select count(*) into n from public.push_subscriptions where member_id = m2;
  report := report || format('%s 32 the admin''s "log out everywhere" silences every device of the partner (%s left)', case when n = 0 then 'ok  ' else 'FAIL' end, n);

  -- ---- who may call what
  select not has_function_privilege('anon', 'public.save_push_subscription(text, text, text, text[], text)', 'execute')
     and not has_function_privilege('anon', 'public.set_push_muted(text, text[])', 'execute')
     and not has_function_privilege('anon', 'public.remove_push_subscription(text)', 'execute')
     and has_function_privilege('authenticated', 'public.save_push_subscription(text, text, text, text[], text)', 'execute')
     and has_function_privilege('authenticated', 'public.set_push_muted(text, text[])', 'execute')
     and has_function_privilege('authenticated', 'public.remove_push_subscription(text)', 'execute') into b;
  report := report || format('%s 33 the three functions are for logged-in devices only (%s)', case when b then 'ok  ' else 'FAIL' end, b);
  select not has_function_privilege('authenticated', 'private.send_push(text, uuid, uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'private.push_on_serving()', 'execute')
     and not has_function_privilege('authenticated', 'private.push_on_review()', 'execute')
     and not has_function_privilege('authenticated', 'private.drop_device_pushes()', 'execute')
     and not has_table_privilege('authenticated', 'private.push_config', 'select')
     and not has_table_privilege('anon', 'private.push_config', 'select')
     and not has_table_privilege('authenticated', 'public.push_subscriptions', 'select')
     and has_function_privilege('authenticated', 'private.my_member_ids()', 'execute')
     and has_function_privilege('authenticated', 'private.seat_state()', 'execute') into b;
  report := report || format('%s 34 the settings, the secret and the sending are out of the app''s reach; the old helpers still work (%s)', case when b then 'ok  ' else 'FAIL' end, b);

  raise exception E'PUSH REPORT (rolled back)\n%', array_to_string(report, E'\n');
end
$$;
