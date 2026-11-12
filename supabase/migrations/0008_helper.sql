-- The kitchen's helper (Edge Function "ai") reads recipes from links. Every reading
-- costs a little, so the database hands out tickets: only somebody with a seat in the
-- kitchen gets one, and a kitchen gets a fixed number per day. The function asks for a
-- ticket with the caller's own login before it fetches anything.
--
-- Nothing here is needed by the app itself; without this migration the helper refuses
-- everybody.

create table private.helper_tickets (
  household_id uuid not null references public.households (id) on delete cascade,
  day date not null,
  used integer not null default 0,
  primary key (household_id, day)
);

alter table private.helper_tickets enable row level security;
revoke all on private.helper_tickets from public, anon, authenticated;

-- Take one of today's tickets (the kitchen's day, Europe/Zurich). Returns how many are
-- left. Raises not_in_kitchen for a login without a seat, and ai_limit when today's are
-- used up.
create function public.ai_ticket() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  kitchen uuid;
  today date := (now() at time zone 'Europe/Zurich')::date;
  per_day constant integer := 40;
  taken integer;
begin
  select h into kitchen from private.my_household_ids() as h limit 1;
  if kitchen is null then
    raise exception 'not_in_kitchen' using errcode = 'P0001';
  end if;

  insert into private.helper_tickets as t (household_id, day, used)
  values (kitchen, today, 1)
  on conflict (household_id, day) do update set used = t.used + 1
    where t.used < per_day
  returning t.used into taken;

  if taken is null then
    raise exception 'ai_limit' using errcode = 'P0001';
  end if;

  -- Old days are of no use to anybody.
  delete from private.helper_tickets where day < today - 30;
  return per_day - taken;
end
$$;

revoke all on function public.ai_ticket() from public, anon;
grant execute on function public.ai_ticket() to authenticated;
