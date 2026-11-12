-- The basket (a shared shopping list) and the pantry (what is at home, and how much).
-- Two more synced tables with the same rules as dishes or meals: anybody with a seat in
-- the kitchen reads, adds and edits; rows are soft-deleted; nobody else sees anything.
--
-- Additive: nothing that exists is changed, except sync_pull, which hands out two more
-- lists. An app from before this migration ignores them.

create table public.basket (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- As written: "500 g", "2", "1 pack".
  amount text check (amount is null or char_length(amount) <= 40),
  note text check (note is null or char_length(note) <= 120),
  -- suggested: the helper thinks it is needed, nobody has decided yet.
  -- open: on the list. bought: ticked off.
  state text not null default 'open' check (state in ('suggested', 'open', 'bought')),
  source text not null default 'hand' check (source in ('hand', 'dish', 'fork')),
  -- The helper's reason for a suggestion.
  reason text check (reason is null or char_length(reason) <= 240),
  dish_id uuid references public.dishes (id) on delete set null,
  added_by uuid references public.members (id) on delete set null,
  bought_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.pantry (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- As written: "1 kg", "half a pack", "almost empty".
  amount text check (amount is null or char_length(amount) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
declare
  t text;
begin
  foreach t in array array['basket', 'pantry']
  loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function private.touch_row()', t);
    execute format('create index %I on public.%I (household_id, updated_at)', t || '_household_updated_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format(
      'create policy "kitchen members read" on public.%I for select to authenticated using (household_id in (select private.my_household_ids()))', t);
    execute format(
      'create policy "kitchen members add" on public.%I for insert to authenticated with check (household_id in (select private.my_household_ids()))', t);
    execute format(
      'create policy "kitchen members edit" on public.%I for update to authenticated using (household_id in (select private.my_household_ids())) with check (household_id in (select private.my_household_ids()))', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end
$$;

-- Everything that changed since the cursor, plus whether this device still has its seat.
-- As before, with the basket and the pantry added.
create or replace function public.sync_pull(p_since timestamptz default null) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'server_time', now(),
    'seat', private.seat_state(),
    'households', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.households t
                   where p_since is null or t.updated_at > p_since),
    'members', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.members t
                where p_since is null or t.updated_at > p_since),
    'criteria', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.criteria t
                 where p_since is null or t.updated_at > p_since),
    'dishes', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.dishes t
               where p_since is null or t.updated_at > p_since),
    'menus', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.menus t
              where p_since is null or t.updated_at > p_since),
    'servings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.servings t
                 where p_since is null or t.updated_at > p_since),
    'reviews', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.reviews t
                where p_since is null or t.updated_at > p_since),
    'photos', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.photos t
               where p_since is null or t.updated_at > p_since),
    'basket', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.basket t
                       where p_since is null or t.updated_at > p_since),
    'pantry', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pantry t
                     where p_since is null or t.updated_at > p_since)
  )
$$;
