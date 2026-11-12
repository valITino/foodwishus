-- Test for the basket and the pantry (0009_basket.sql): the two of a kitchen share
-- them, nobody else sees or touches them, and a pull hands them out.
--
-- Run it locally with supabase/tests/local/run.sh basket (or in the Supabase SQL editor).
-- It builds two throwaway kitchens with throwaway logins and ROLLS EVERYTHING BACK by
-- ending with an exception whose message is the report. "FAIL" lines mean something is wrong.

do $$
declare
  u1 uuid := gen_random_uuid(); -- Ana, kitchen one
  u2 uuid := gen_random_uuid(); -- Ben, kitchen one
  u3 uuid := gen_random_uuid(); -- Cleo, kitchen two
  u4 uuid := gen_random_uuid(); -- a login without a seat
  h1 uuid := gen_random_uuid();
  h2 uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  m3 uuid := gen_random_uuid();
  milk uuid := gen_random_uuid();
  flour uuid := gen_random_uuid();
  n integer;
  b boolean;
  txt text;
  pulled jsonb;
  first_change timestamptz;
  report text[] := '{}';
begin
  insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
  select u, 'authenticated', 'authenticated', true, now(), now() from unnest(array[u1, u2, u3, u4]) as u;
  insert into public.households (id, name) values (h1, 'Basket test kitchen'), (h2, 'Another kitchen');
  insert into public.members (id, household_id, name, default_role, is_admin) values
    (m1, h1, 'Ana Baskettest', 'chef', true),
    (m2, h1, 'Ben Baskettest', 'taster', false),
    (m3, h2, 'Cleo Baskettest', 'chef', true);
  insert into private.member_devices (user_id, member_id) values (u1, m1), (u2, m2), (u3, m3);

  -- ---- she writes something on the list and notes something in the pantry
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  insert into public.basket (id, household_id, name, amount, added_by) values (milk, h1, 'Milk', '1 l', m1);
  insert into public.pantry (id, household_id, name, amount) values (flour, h1, 'Flour', 'half a kilo');
  select count(*) into n from public.basket;
  report := report || format('%s 01 a member adds to the basket and the pantry (%s on the list)', case when n = 1 then 'ok  ' else 'FAIL' end, n);

  -- ---- he sees both, ticks the milk off, and the change is stamped by the database
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  select updated_at into first_change from public.basket where id = milk;
  update public.basket set state = 'bought', bought_at = now(), updated_at = '2000-01-01' where id = milk;
  select state into txt from public.basket where id = milk;
  select updated_at > first_change into b from public.basket where id = milk;
  select count(*) into n from public.pantry;
  report := report || format('%s 02 the partner sees both and ticks off (%s, pantry %s, stamped anew %s)', case when txt = 'bought' and n = 1 and b then 'ok  ' else 'FAIL' end, txt, n, b);

  -- ---- a pull hands both lists out, and only what changed since
  pulled := public.sync_pull(null);
  b := jsonb_array_length(pulled -> 'basket') = 1 and jsonb_array_length(pulled -> 'pantry') = 1 and pulled ? 'dishes';
  report := report || format('%s 03 a first pull brings the basket and the pantry along (%s)', case when b then 'ok  ' else 'FAIL' end, b);
  pulled := public.sync_pull(now() + interval '1 minute');
  b := jsonb_array_length(pulled -> 'basket') = 0 and jsonb_array_length(pulled -> 'pantry') = 0;
  report := report || format('%s 04 a later pull brings nothing that did not change (%s)', case when b then 'ok  ' else 'FAIL' end, b);

  -- ---- the other kitchen sees nothing and can change nothing
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  select (select count(*) from public.basket) + (select count(*) from public.pantry) into n;
  update public.basket set name = 'Taken over' where id = milk;
  update public.pantry set amount = 'gone' where id = flour;
  pulled := public.sync_pull(null);
  b := n = 0 and jsonb_array_length(pulled -> 'basket') = 0 and jsonb_array_length(pulled -> 'pantry') = 0;
  report := report || format('%s 05 another kitchen sees nothing of it (%s rows, pull empty %s)', case when b then 'ok  ' else 'FAIL' end, n, b);

  -- ---- and cannot plant rows in a kitchen that is not theirs
  begin
    insert into public.basket (household_id, name) values (h1, 'Planted');
    txt := 'planted';
  exception when others then
    txt := 'refused';
  end;
  report := report || format('%s 06 nobody adds to another kitchen''s basket (%s)', case when txt = 'refused' then 'ok  ' else 'FAIL' end, txt);
  begin
    insert into public.pantry (household_id, name) values (h1, 'Planted');
    txt := 'planted';
  exception when others then
    txt := 'refused';
  end;
  report := report || format('%s 07 nor to its pantry (%s)', case when txt = 'refused' then 'ok  ' else 'FAIL' end, txt);

  -- ---- a login without a seat gets nothing at all
  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  select (select count(*) from public.basket) + (select count(*) from public.pantry) into n;
  report := report || format('%s 08 a login without a seat sees nothing (%s rows)', case when n = 0 then 'ok  ' else 'FAIL' end, n);

  -- ---- what the other kitchen tried changed nothing, and a row cannot move kitchens
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  update public.basket set household_id = h2 where id = milk;
  select name || '/' || (household_id = h1)::text into txt from public.basket where id = milk;
  report := report || format('%s 09 the row is untouched and stays in its kitchen (%s)', case when txt = 'Milk/true' then 'ok  ' else 'FAIL' end, txt);

  -- ---- rows are soft-deleted; there is no hard delete for the app
  update public.basket set deleted_at = now() where id = milk;
  begin
    delete from public.pantry where id = flour;
    get diagnostics n = row_count;
    txt := format('deleted %s', n);
  exception when others then
    txt := 'refused';
  end;
  select count(*) into n from public.pantry where id = flour;
  report := report || format('%s 10 a row is removed by marking it; a hard delete is not possible (%s, still there %s)', case when n = 1 then 'ok  ' else 'FAIL' end, txt, n);

  -- ---- the database keeps the lists tidy
  begin
    insert into public.basket (household_id, name, state) values (h1, 'Odd', 'eaten');
    txt := 'taken';
  exception when others then
    txt := 'refused';
  end;
  begin
    insert into public.pantry (household_id, name) values (h1, '');
    txt := txt || '/taken';
  exception when others then
    txt := txt || '/refused';
  end;
  report := report || format('%s 11 an unknown state and an empty name are refused (%s)', case when txt = 'refused/refused' then 'ok  ' else 'FAIL' end, txt);

  reset role;
  select not has_table_privilege('anon', 'public.basket', 'select')
     and not has_table_privilege('anon', 'public.pantry', 'select')
     and not has_table_privilege('authenticated', 'public.basket', 'delete')
     and not has_table_privilege('authenticated', 'public.pantry', 'delete')
     and (select count(*) = 2 from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('basket', 'pantry')) into b;
  report := report || format('%s 12 on paper too: strangers have no access, nobody deletes, changes are broadcast to the kitchen (%s)', case when b then 'ok  ' else 'FAIL' end, b);

  raise exception E'BASKET REPORT (rolled back)\n%', array_to_string(report, E'\n');
end
$$;
