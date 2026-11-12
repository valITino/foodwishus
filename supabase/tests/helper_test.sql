-- Test for the helper's tickets (0008_helper.sql): who gets one, how many a kitchen
-- gets per day, and that one kitchen's tickets are nobody else's.
--
-- Run it locally with supabase/tests/local/run.sh helper (or in the Supabase SQL editor).
-- It builds two throwaway kitchens with throwaway logins and ROLLS EVERYTHING BACK by
-- ending with an exception whose message is the report. "FAIL" lines mean something is wrong.

do $$
declare
  u1 uuid := gen_random_uuid(); -- Ana, kitchen one
  u2 uuid := gen_random_uuid(); -- Ben, kitchen one
  u3 uuid := gen_random_uuid(); -- Cleo, kitchen two
  u4 uuid := gen_random_uuid(); -- a login without a seat
  u5 uuid := gen_random_uuid(); -- Dan, paused in kitchen one
  h1 uuid := gen_random_uuid();
  h2 uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  m3 uuid := gen_random_uuid();
  m5 uuid := gen_random_uuid();
  today date := (now() at time zone 'Europe/Zurich')::date;
  n integer;
  b boolean;
  txt text;
  report text[] := '{}';
begin
  insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
  select u, 'authenticated', 'authenticated', true, now(), now() from unnest(array[u1, u2, u3, u4, u5]) as u;
  insert into public.households (id, name) values (h1, 'Helper test kitchen'), (h2, 'Another kitchen');
  insert into public.members (id, household_id, name, default_role, is_admin, disabled_at) values
    (m1, h1, 'Ana Helpertest', 'chef', true, null),
    (m2, h1, 'Ben Helpertest', 'taster', false, null),
    (m5, h1, 'Dan Helpertest', 'taster', false, now()),
    (m3, h2, 'Cleo Helpertest', 'chef', true, null);
  insert into private.member_devices (user_id, member_id) values (u1, m1), (u2, m2), (u3, m3), (u5, m5);

  -- ---- a seat gets a ticket, and the count goes down
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  n := public.ai_ticket();
  report := report || format('%s 01 the first ticket of the day leaves 39 (%s)', case when n = 39 then 'ok  ' else 'FAIL' end, n);

  -- ---- the two of them share the kitchen's tickets
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  n := public.ai_ticket();
  report := report || format('%s 02 the partner takes from the same pile (%s left)', case when n = 38 then 'ok  ' else 'FAIL' end, n);

  -- ---- another kitchen has its own pile
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  n := public.ai_ticket();
  report := report || format('%s 03 another kitchen starts at its own 39 (%s)', case when n = 39 then 'ok  ' else 'FAIL' end, n);

  -- ---- no seat, no ticket
  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  begin
    perform public.ai_ticket();
    txt := 'got one';
  exception when others then
    txt := sqlerrm;
  end;
  report := report || format('%s 04 a login without a seat is refused (%s)', case when txt = 'not_in_kitchen' then 'ok  ' else 'FAIL' end, txt);

  perform set_config('request.jwt.claims', json_build_object('sub', u5, 'role', 'authenticated')::text, true);
  begin
    perform public.ai_ticket();
    txt := 'got one';
  exception when others then
    txt := sqlerrm;
  end;
  report := report || format('%s 05 a paused profile is refused (%s)', case when txt = 'not_in_kitchen' then 'ok  ' else 'FAIL' end, txt);

  -- ---- forty a day, then no more, and the refusal takes nothing
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  for i in 1..38 loop
    n := public.ai_ticket();
  end loop;
  report := report || format('%s 06 the fortieth ticket leaves none (%s)', case when n = 0 then 'ok  ' else 'FAIL' end, n);
  begin
    perform public.ai_ticket();
    txt := 'got one';
  exception when others then
    txt := sqlerrm;
  end;
  select used into n from private.helper_tickets where household_id = h1 and day = today;
  report := report || format('%s 07 the forty-first is refused (%s) and the count stays at 40 (%s)', case when txt = 'ai_limit' and n = 40 then 'ok  ' else 'FAIL' end, txt, n);

  -- ---- the other kitchen is not affected
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  n := public.ai_ticket();
  report := report || format('%s 08 the other kitchen still gets tickets (%s left)', case when n = 38 then 'ok  ' else 'FAIL' end, n);

  -- ---- tomorrow the pile is full again, and old days are cleared away
  update private.helper_tickets set day = today - 1 where household_id = h1;
  insert into private.helper_tickets (household_id, day, used) values (h1, today - 45, 7);
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  n := public.ai_ticket();
  select count(*) into strict txt from private.helper_tickets where household_id = h1;
  report := report || format('%s 09 a new day starts at 39 (%s); yesterday is kept, last month is gone (%s rows)', case when n = 39 and txt = '2' then 'ok  ' else 'FAIL' end, n, txt);

  -- ---- nobody reads or writes the counter directly, and strangers cannot even ask
  select not has_table_privilege('authenticated', 'private.helper_tickets', 'select')
     and not has_table_privilege('authenticated', 'private.helper_tickets', 'update')
     and not has_table_privilege('anon', 'private.helper_tickets', 'select')
     and has_function_privilege('authenticated', 'public.ai_ticket()', 'execute')
     and not has_function_privilege('anon', 'public.ai_ticket()', 'execute') into b;
  report := report || format('%s 10 on paper too: the counter is private, tickets are for logged-in devices only (%s)', case when b then 'ok  ' else 'FAIL' end, b);

  raise exception E'HELPER REPORT (rolled back)\n%', array_to_string(report, E'\n');
end
$$;
