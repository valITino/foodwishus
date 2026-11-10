-- Test for push notifications in the database (0007_push.sql): which changes call the
-- push function, that nothing else does, that a write never fails because of it, who
-- may manage which device's subscription, and who can get at the secret and the keys.
--
-- Run it in the Supabase SQL editor, or locally with supabase/tests/local/run.sh push.
-- It builds a throwaway second kitchen with three throwaway logins, plays through the
-- five events, then ROLLS EVERYTHING BACK by ending with an exception whose message is
-- the report. "FAIL" lines mean something is wrong.
--
-- Safe next to a real kitchen: it touches only its own rows, and nothing is ever sent.
-- pg_net delivers after a commit, and this never commits. While it runs it points the
-- push settings at an address that does not exist; the rollback restores the real ones,
-- secret and keys included.

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
  v_subject constant text := 'https://push-test.invalid/app/';
  key_a constant text := 'B' || repeat('a', 86);  -- shaped like a public key
  key_a_private constant text := repeat('p', 43);
  key_b constant text := 'B' || repeat('b', 86);
  key_b_private constant text := repeat('q', 43);
  v_secret text;
  ep_phone constant text := 'https://push-test.invalid/send/bens-phone';
  ep_tablet constant text := 'https://push-test.invalid/send/bens-tablet';
  ep_new constant text := 'https://push-test.invalid/send/bens-phone-renewed';
  seen integer := 0;
  n integer;
  b boolean;
  txt text;
  target_now text;
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

  -- ---- switching on: one statement, and the secret is made in the database
  perform private.push_setup(target, v_subject);
  select c.secret into v_secret from private.push_config c;
  report := report || format('%s 01b set-up makes its own secret (%s characters) and stores address and subject', case when char_length(v_secret) >= 32 and (select count(*) from private.push_config c where c.function_url = target and c.subject = v_subject) = 1 then 'ok  ' else 'FAIL' end, char_length(v_secret));
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
  report := report || format('%s 03 the call carries the shared secret and is JSON', case when hdr ->> 'x-push-secret' = v_secret and hdr ->> 'Content-Type' = 'application/json' then 'ok  ' else 'FAIL' end);
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

  -- ---- the secret and the keys: made here, readable by the function only
  perform private.push_setup('https://push-test.invalid/functions/v1/push-moved', v_subject);
  select c.secret, c.function_url into txt, target_now from private.push_config c;
  report := report || format('%s 35 running set-up again moves the address (%s) and keeps the secret', case when txt = v_secret and target_now like '%%push-moved' then 'ok  ' else 'FAIL' end, target_now like '%%push-moved');

  perform private.push_new_secret();
  select c.secret into txt from private.push_config c;
  report := report || format('%s 36 a new secret on request: different, and long enough (%s characters)', case when txt <> v_secret and char_length(txt) >= 32 then 'ok  ' else 'FAIL' end, char_length(txt));
  v_secret := txt;

  begin
    perform private.push_setup('http://push-test.invalid/not-https', v_subject);
    report := report || text 'FAIL 37 set-up accepted an address that is not https';
  exception when others then
    report := report || format('ok   37 set-up refuses an address that is not https (%s)', sqlstate);
  end;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  begin
    perform public.push_settings();
    report := report || text 'FAIL 38 a logged-in device could read the secret and the private key';
  exception when others then
    report := report || format('ok   38 a logged-in device cannot read the secret or the private key (%s)', sqlstate);
  end;
  begin
    perform public.push_store_keys(key_a, key_a_private);
    report := report || text 'FAIL 39 a logged-in device could plant its own key pair';
  exception when others then
    report := report || format('ok   39 a logged-in device cannot plant a key pair (%s)', sqlstate);
  end;
  select public.push_public_key() into txt;
  report := report || format('%s 40 a logged-in device may ask for the public key: none yet (%s)', case when txt is null then 'ok  ' else 'FAIL' end, coalesce(txt, 'null'));
  execute 'reset role';

  execute 'set local role anon';
  n := 0;
  begin perform public.push_settings(); exception when others then n := n + 1; end;
  begin perform public.push_store_keys(key_a, key_a_private); exception when others then n := n + 1; end;
  begin perform public.push_public_key(); exception when others then n := n + 1; end;
  execute 'reset role';
  report := report || format('%s 41 somebody without a login gets none of the three (%s of 3 refused)', case when n = 3 then 'ok  ' else 'FAIL' end, n);

  execute 'set local role service_role';
  ev := public.push_settings();
  report := report || format('%s 42 the function (service role) gets secret and subject, and sees that there are no keys yet',
    case when ev ->> 'secret' = v_secret and ev ->> 'subject' = v_subject and ev -> 'vapid_public' = 'null'::jsonb and ev -> 'vapid_private' = 'null'::jsonb then 'ok  ' else 'FAIL' end);
  begin
    perform public.push_store_keys('not a key', key_a_private);
    report := report || text 'FAIL 43 something that is not a key was stored';
  exception when others then
    report := report || format('%s 43 something that is not a key is refused (%s)', case when sqlerrm = 'push_invalid' then 'ok  ' else 'FAIL' end, sqlerrm);
  end;
  ev := public.push_store_keys(key_a, key_a_private);
  hdr := public.push_store_keys(key_b, key_b_private);
  report := report || format('%s 44 the first pair is kept; a second caller is answered with that same pair',
    case when ev = jsonb_build_object('vapid_public', key_a, 'vapid_private', key_a_private) and hdr = ev then 'ok  ' else 'FAIL' end);
  ev := public.push_settings();
  execute 'reset role';
  report := report || format('%s 45 from then on the function gets the pair with its settings', case when ev ->> 'vapid_public' = key_a and ev ->> 'vapid_private' = key_a_private and ev ->> 'secret' = v_secret then 'ok  ' else 'FAIL' end);

  execute 'set local role authenticated';
  select public.push_public_key() into txt;
  execute 'reset role';
  report := report || format('%s 46 and the app gets the public half, nothing more', case when txt = key_a then 'ok  ' else 'FAIL' end);

  perform private.push_setup(target, v_subject);
  select count(*) into n from private.push_config c where c.vapid_public = key_a and c.secret = v_secret;
  report := report || format('%s 47 running set-up again keeps the keys too (%s)', case when n = 1 then 'ok  ' else 'FAIL' end, n);

  perform private.push_forget_keys();
  execute 'set local role service_role';
  ev := public.push_store_keys(key_b, key_b_private);
  execute 'reset role';
  report := report || format('%s 48 after the keys are thrown away, a new pair can be stored', case when ev ->> 'vapid_public' = key_b then 'ok  ' else 'FAIL' end);

  delete from private.push_config;
  perform private.push_new_secret();
  perform private.push_forget_keys();
  execute 'set local role service_role';
  ev := public.push_settings();
  hdr := public.push_store_keys(key_a, key_a_private);
  execute 'reset role';
  select count(*) into n from private.push_config;
  report := report || format('%s 49 switched off: no settings, no keys, nothing stored (%s rows)', case when ev is null and hdr is null and public.push_public_key() is null and n = 0 then 'ok  ' else 'FAIL' end, n);

  select not has_function_privilege('authenticated', 'public.push_settings()', 'execute')
     and not has_function_privilege('authenticated', 'public.push_store_keys(text, text)', 'execute')
     and not has_function_privilege('anon', 'public.push_settings()', 'execute')
     and not has_function_privilege('anon', 'public.push_store_keys(text, text)', 'execute')
     and not has_function_privilege('anon', 'public.push_public_key()', 'execute')
     and has_function_privilege('authenticated', 'public.push_public_key()', 'execute')
     and has_function_privilege('service_role', 'public.push_settings()', 'execute')
     and has_function_privilege('service_role', 'public.push_store_keys(text, text)', 'execute')
     and not has_function_privilege('authenticated', 'private.push_setup(text, text)', 'execute')
     and not has_function_privilege('authenticated', 'private.push_new_secret()', 'execute')
     and not has_function_privilege('authenticated', 'private.push_forget_keys()', 'execute')
     and not has_function_privilege('service_role', 'private.push_setup(text, text)', 'execute')
     and not has_function_privilege('anon', 'private.push_setup(text, text)', 'execute') into b;
  report := report || format('%s 50 on paper too: settings and keys for the service role, the public key for logged-in devices, set-up for the owner alone (%s)', case when b then 'ok  ' else 'FAIL' end, b);

  raise exception E'PUSH REPORT (rolled back)\n%', array_to_string(report, E'\n');
end
$$;
