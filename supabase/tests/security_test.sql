-- Security test for the FoodwishUs database.
-- Run it in the Supabase SQL editor. It creates three throwaway users, plays through
-- pairing, outsider attacks, restore and recovery, then ROLLS EVERYTHING BACK by
-- ending with an exception whose message is the report. "FAIL" lines mean a hole.
-- Only run it while no real kitchen exists yet (the single-kitchen lock would trip).

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  r jsonb;
  hh uuid;
  m1 uuid;
  m2 uuid;
  code text;
  key text;
  n integer;
  dish uuid := gen_random_uuid();
  serving uuid := gen_random_uuid();
  review uuid := gen_random_uuid();
  t1 timestamptz;
  t2 timestamptz;
  v smallint;
  txt text;
  report text[] := '{}';
begin
  insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at) values
    (u1, 'authenticated', 'authenticated', true, now(), now()),
    (u2, 'authenticated', 'authenticated', true, now(), now()),
    (u3, 'authenticated', 'authenticated', true, now(), now());

  execute 'set local role authenticated';

  -- ---- person 1 starts the kitchen
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  r := public.create_household('Test kitchen', '{"name":"Ana","default_role":"chef"}');
  hh := (r ->> 'household_id')::uuid;
  m1 := (r ->> 'member_id')::uuid;
  key := r ->> 'recovery_key';
  report := report || format('%s 01 kitchen created, recovery key has %s chars', case when length(key) = 20 then 'ok  ' else 'FAIL' end, length(key));

  insert into public.dishes (id, household_id, name, created_by) values (dish, hh, 'Lasagne', m1);
  select count(*) into n from public.dishes;
  report := report || format('%s 02 owner sees own dish (%s)', case when n = 1 then 'ok  ' else 'FAIL' end, n);
  select count(*) into n from public.criteria;
  report := report || format('%s 03 six default criteria (%s)', case when n = 6 then 'ok  ' else 'FAIL' end, n);

  r := public.create_invite('join');
  code := r ->> 'code';
  report := report || format('%s 04 invite code created (%s chars)', case when length(code) = 10 then 'ok  ' else 'FAIL' end, length(code));

  -- ---- a stranger with a valid anonymous login
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);

  select (select count(*) from public.dishes) + (select count(*) from public.households)
       + (select count(*) from public.members) + (select count(*) from public.criteria) into n;
  report := report || format('%s 05 stranger reads nothing (%s rows)', case when n = 0 then 'ok  ' else 'FAIL' end, n);

  begin
    insert into public.dishes (household_id, name) values (hh, 'Hack');
    report := report || text 'FAIL 06 stranger could insert a dish';
  exception when others then
    report := report || format('ok   06 stranger insert blocked (%s)', sqlstate);
  end;

  update public.dishes set name = 'Hacked' where id = dish;
  get diagnostics n = row_count;
  report := report || format('%s 07 stranger update touches %s rows', case when n = 0 then 'ok  ' else 'FAIL' end, n);

  begin
    perform public.create_household('Evil kitchen', '{}');
    report := report || text 'FAIL 08 stranger could create a second kitchen';
  exception when others then
    report := report || format('%s 08 second kitchen refused (%s)', case when sqlerrm = 'kitchen_already_exists' then 'ok  ' else 'FAIL' end, sqlerrm);
  end;

  begin
    perform public.join_household('WRONGCODE1');
    report := report || text 'FAIL 09 stranger joined with a wrong code';
  exception when others then
    report := report || format('%s 09 wrong invite refused (%s)', case when sqlerrm = 'invite_invalid' then 'ok  ' else 'FAIL' end, sqlerrm);
  end;

  begin
    perform public.recovery_peek('AAAAAAAAAAAAAAAAAAAA');
    report := report || text 'FAIL 10 wrong recovery key accepted';
  exception when others then
    report := report || format('%s 10 wrong recovery key refused (%s)', case when sqlerrm = 'recovery_key_invalid' then 'ok  ' else 'FAIL' end, sqlerrm);
  end;

  r := public.sync_pull(null);
  n := jsonb_array_length(r -> 'dishes') + jsonb_array_length(r -> 'members') + jsonb_array_length(r -> 'households');
  report := report || format('%s 11 stranger sync_pull is empty (%s rows)', case when n = 0 then 'ok  ' else 'FAIL' end, n);

  begin
    select count(*) into n from public.invites;
    report := report || text 'FAIL 12 invites table is readable';
  exception when others then
    report := report || format('ok   12 invites table locked (%s)', sqlstate);
  end;

  begin
    select count(*) into n from private.household_secrets;
    report := report || text 'FAIL 13 recovery hashes are readable';
  exception when others then
    report := report || format('ok   13 recovery hashes locked (%s)', sqlstate);
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('photos', hh::text || '/stolen.jpg');
    report := report || text 'FAIL 14 stranger could upload into the kitchen folder';
  exception when others then
    report := report || format('ok   14 stranger photo upload blocked (%s)', sqlstate);
  end;

  -- ---- person 2 joins with the code
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  r := public.join_household(lower(code), '{"name":"Ben"}');
  m2 := (r ->> 'member_id')::uuid;
  select count(*) into n from public.dishes;
  report := report || format('%s 15 partner joined and sees the dish (%s)', case when n = 1 then 'ok  ' else 'FAIL' end, n);

  select updated_at into t1 from public.dishes where id = dish;
  update public.dishes set name = 'Lasagne al forno' where id = dish;
  get diagnostics n = row_count;
  select updated_at into t2 from public.dishes where id = dish;
  report := report || format('%s 16 partner edits the dish, updated_at moves forward', case when n = 1 and t2 > t1 then 'ok  ' else 'FAIL' end);

  update public.members set name = 'Not Ana' where id = m1;
  get diagnostics n = row_count;
  report := report || format('%s 17 cannot edit partner profile (%s rows)', case when n = 0 then 'ok  ' else 'FAIL' end, n);

  update public.members set name = 'Benny' where id = m2;
  get diagnostics n = row_count;
  report := report || format('%s 18 can edit own profile (%s rows)', case when n = 1 then 'ok  ' else 'FAIL' end, n);

  begin
    update public.members set user_id = u3 where id = m2;
    report := report || text 'FAIL 19 member could hand their seat to someone else';
  exception when others then
    report := report || format('ok   19 seat reassignment blocked (%s)', sqlstate);
  end;

  begin
    delete from public.dishes where id = dish;
    report := report || text 'FAIL 20 hard delete allowed';
  exception when others then
    report := report || format('ok   20 hard delete blocked (%s)', sqlstate);
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('photos', hh::text || '/' || gen_random_uuid()::text || '.jpg');
    report := report || text 'ok   21 member can add a photo to the kitchen folder';
  exception when others then
    report := report || format('FAIL 21 member photo upload blocked (%s %s)', sqlstate, sqlerrm);
  end;

  begin
    perform public.create_invite('join');
    report := report || text 'FAIL 22 third seat could be invited';
  exception when others then
    report := report || format('%s 22 kitchen is full at two (%s)', case when sqlerrm = 'kitchen_full' then 'ok  ' else 'FAIL' end, sqlerrm);
  end;

  -- ---- review sealing
  insert into public.servings (id, household_id, dish_id, proposed_by, status) values (serving, hh, dish, m1, 'eaten');
  insert into public.reviews (id, household_id, serving_id, dish_id, reviewer_id, overall, sealed_at)
  values (review, hh, serving, dish, m2, 4, now() - interval '1 minute');
  update public.reviews set overall = 1, chef_reply = 'Glad you liked it' where id = review;
  select overall, chef_reply into v, txt from public.reviews where id = review;
  report := report || format('%s 23 sealed review keeps its rating (%s) but takes the chef reply (%s)',
    case when v = 4 and txt = 'Glad you liked it' then 'ok  ' else 'FAIL' end, v, txt);

  -- ---- restore: person 1 moves person 2 onto a new phone (u3)
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  r := public.create_invite('restore', m2);
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  r := public.join_household(r ->> 'code');
  select count(*) into n from public.dishes;
  report := report || format('%s 24 restore invite moves the profile to the new phone (%s dish)', case when n = 1 and (r ->> 'member_id')::uuid = m2 then 'ok  ' else 'FAIL' end, n);

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  select count(*) into n from public.dishes;
  report := report || format('%s 25 the old phone is locked out (%s rows)', case when n = 0 then 'ok  ' else 'FAIL' end, n);

  -- ---- recovery key: the old phone (u2) gets back in as person 1
  r := public.recovery_peek(lower(substr(key, 1, 5)) || '-' || substr(key, 6));
  n := jsonb_array_length(r -> 'members');
  r := public.recover_member(key, m1);
  select count(*) into n from public.dishes;
  report := report || format('%s 26 recovery key restores access (%s dish)', case when n = 1 then 'ok  ' else 'FAIL' end, n);

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  select count(*) into n from public.dishes;
  report := report || format('%s 27 the replaced login is locked out (%s rows)', case when n = 0 then 'ok  ' else 'FAIL' end, n);

  execute 'reset role';
  raise exception E'SECURITY REPORT (rolled back)\n%', array_to_string(report, E'\n');
end
$$;
