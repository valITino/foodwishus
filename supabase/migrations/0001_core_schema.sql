-- FoodwishUs core schema
-- One kitchen (household), two members, everything else hangs off household_id.
-- Every synced table carries: id (client-generated uuid), household_id, created_at,
-- updated_at (server clock, used as the sync cursor) and deleted_at (soft delete).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- tables ----

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 40),
  avatar text not null default 'fork',
  color text not null default 'rose',
  default_role text not null default 'taster' check (default_role in ('chef', 'taster')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  course text not null default 'main'
    check (course in ('starter', 'main', 'side', 'dessert', 'breakfast', 'snack', 'drink')),
  tags text[] not null default '{}',
  effort text check (effort in ('easy', 'medium', 'fancy')),
  recipe jsonb not null default '{}'::jsonb,
  nutrition jsonb not null default '{}'::jsonb,
  cover_photo_id uuid,
  icon text,
  created_by uuid references public.members (id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  courses jsonb not null default '[]'::jsonb,
  created_by uuid references public.members (id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.servings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  dish_id uuid references public.dishes (id) on delete cascade,
  menu_id uuid references public.menus (id) on delete cascade,
  proposed_by uuid references public.members (id) on delete set null,
  cooked_by uuid references public.members (id) on delete set null,
  proposed_at timestamptz not null default now(),
  note text,
  suggested_days text[] not null default '{}',
  craving smallint check (craving between 1 and 5),
  priority text not null default 'a0',
  status text not null default 'wishlist'
    check (status in ('wishlist', 'planned', 'served', 'eaten', 'skipped')),
  planned_date date,
  planned_slot text check (planned_slot in ('breakfast', 'lunch', 'dinner', 'dessert')),
  served_at timestamptz,
  eaten_at timestamptz,
  skipped_reason text,
  proof_photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (dish_id is not null or menu_id is not null)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  serving_id uuid not null references public.servings (id) on delete cascade,
  dish_id uuid references public.dishes (id) on delete cascade,
  reviewer_id uuid references public.members (id) on delete set null,
  reaction smallint check (reaction between 1 and 6),
  extra_reactions text[] not null default '{}',
  overall smallint check (overall between 1 and 5),
  scores jsonb not null default '{}'::jsonb,
  portions_eaten numeric(3, 1) not null default 1 check (portions_eaten > 0 and portions_eaten <= 9),
  would_eat_again boolean,
  comment text,
  chips text[] not null default '{}',
  chef_self_rating smallint check (chef_self_rating between 1 and 5),
  chef_reaction smallint check (chef_reaction between 1 and 6),
  chef_extra_reactions text[] not null default '{}',
  chef_reply text,
  sealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.criteria (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  icon text not null default 'spoon',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Photo metadata. The image bytes live in Storage at
--   photos/<household_id>/<id>.jpg  and  photos/<household_id>/<id>_t.jpg
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null default 'proof' check (kind in ('proof', 'cover', 'step', 'avatar')),
  width integer,
  height integer,
  bytes integer,
  source text check (source in ('camera', 'gallery')),
  taken_at timestamptz,
  created_by uuid references public.members (id) on delete set null,
  uploaded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  muted_types text[] not null default '{}',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pairing codes. Only reachable through the functions below.
create table public.invites (
  code text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null default 'join' check (kind in ('join', 'restore')),
  member_id uuid references public.members (id) on delete cascade,
  created_by uuid references public.members (id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Recovery key hashes. Never exposed through the API.
create table private.household_secrets (
  household_id uuid primary key references public.households (id) on delete cascade,
  recovery_hash text not null,
  rotated_at timestamptz not null default now()
);

-- --------------------------------------------------------------- helpers ----

create function private.my_household_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.household_id
  from public.members m
  where m.user_id = (select auth.uid()) and m.deleted_at is null
$$;

create function private.my_member_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.id
  from public.members m
  where m.user_id = (select auth.uid()) and m.deleted_at is null
$$;

revoke all on function private.my_household_ids() from public;
revoke all on function private.my_member_ids() from public;
grant execute on function private.my_household_ids() to authenticated;
grant execute on function private.my_member_ids() to authenticated;

-- Human-friendly random codes (no I, O, 0, 1).
create function private.random_code(p_length integer) returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(p_length);
  result text := '';
begin
  for i in 0 .. p_length - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end
$$;

create function private.hash_key(p_key text) returns text
language sql immutable set search_path = ''
as $$
  select encode(extensions.digest(upper(regexp_replace(p_key, '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex')
$$;

-- Server clock is the sync cursor; identity columns never change.
create function private.touch_row() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.household_id := old.household_id;
    new.created_at := old.created_at;
  end if;
  return new;
end
$$;

create function private.touch_household() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  return new;
end
$$;

-- Reviews seal 24 hours after they arrive. After that the Taster's verdict is
-- frozen; the Chef can still reply and react.
create function private.guard_review() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.sealed_at := least(
      coalesce(new.sealed_at, clock_timestamp() + interval '24 hours'),
      clock_timestamp() + interval '24 hours'
    );
    return new;
  end if;

  new.sealed_at := old.sealed_at;
  new.serving_id := old.serving_id;
  new.reviewer_id := old.reviewer_id;
  if old.sealed_at is not null and clock_timestamp() > old.sealed_at then
    new.reaction := old.reaction;
    new.extra_reactions := old.extra_reactions;
    new.overall := old.overall;
    new.scores := old.scores;
    new.portions_eaten := old.portions_eaten;
    new.would_eat_again := old.would_eat_again;
    new.comment := old.comment;
    new.chips := old.chips;
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end
$$;

-- ------------------------------------------------- triggers, RLS, grants ----

create trigger touch before insert or update on public.households
  for each row execute function private.touch_household();

create trigger guard_review before insert or update on public.reviews
  for each row execute function private.guard_review();

do $$
declare
  t text;
begin
  foreach t in array array['members', 'dishes', 'menus', 'servings', 'reviews', 'criteria', 'photos', 'push_subscriptions']
  loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function private.touch_row()', t);
    execute format('create index %I on public.%I (household_id, updated_at)', t || '_household_updated_idx', t);
  end loop;

  -- Fully synced tables: any member of the kitchen may read, add and edit.
  -- There is no delete policy: rows are soft-deleted through deleted_at.
  foreach t in array array['dishes', 'menus', 'servings', 'reviews', 'criteria', 'photos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format(
      'create policy "kitchen members read" on public.%I for select to authenticated using (household_id in (select private.my_household_ids()))', t);
    execute format(
      'create policy "kitchen members add" on public.%I for insert to authenticated with check (household_id in (select private.my_household_ids()))', t);
    execute format(
      'create policy "kitchen members edit" on public.%I for update to authenticated using (household_id in (select private.my_household_ids())) with check (household_id in (select private.my_household_ids()))', t);
  end loop;
end
$$;

create index servings_dish_idx on public.servings (dish_id);
create index servings_menu_idx on public.servings (menu_id);
create index reviews_serving_idx on public.reviews (serving_id);
create index reviews_dish_idx on public.reviews (dish_id);
create index invites_household_idx on public.invites (household_id);
create index push_subscriptions_member_idx on public.push_subscriptions (member_id);

-- households: members read; members may rename and change shared settings.
alter table public.households enable row level security;
revoke all on public.households from anon, authenticated;
grant select on public.households to authenticated;
grant update (name, settings) on public.households to authenticated;
create policy "kitchen members read" on public.households for select to authenticated
  using (id in (select private.my_household_ids()));
create policy "kitchen members edit" on public.households for update to authenticated
  using (id in (select private.my_household_ids()))
  with check (id in (select private.my_household_ids()));

-- members: both see both profiles; each edits only their own profile fields.
-- Rows are created and re-linked only by the pairing functions.
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;
grant select on public.members to authenticated;
grant update (name, avatar, color, default_role) on public.members to authenticated;
create policy "kitchen members read" on public.members for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy "edit own profile" on public.members for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- push subscriptions: each member manages their own devices.
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
create policy "own devices" on public.push_subscriptions for all to authenticated
  using (member_id in (select private.my_member_ids()))
  with check (
    member_id in (select private.my_member_ids())
    and household_id in (select private.my_household_ids())
  );

-- invites: no direct access at all.
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

-- ------------------------------------------------------------- functions ----

-- Start the kitchen. This project hosts exactly one kitchen: once it exists,
-- nobody else can create another, so a leaked public key is useless to strangers.
create function public.create_household(p_household_name text, p_member jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
  v_member uuid;
  v_key text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if exists (select 1 from public.members where user_id = v_uid and deleted_at is null) then
    raise exception 'already_in_kitchen' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('foodwishus.create_household'));
  if exists (select 1 from public.households where deleted_at is null) then
    raise exception 'kitchen_already_exists' using errcode = 'P0001';
  end if;

  insert into public.households (name)
  values (coalesce(nullif(btrim(p_household_name), ''), 'Our kitchen'))
  returning id into v_household;

  insert into public.members (household_id, user_id, name, avatar, color, default_role)
  values (
    v_household,
    v_uid,
    coalesce(nullif(btrim(p_member ->> 'name'), ''), 'Chef'),
    coalesce(p_member ->> 'avatar', 'whisk'),
    coalesce(p_member ->> 'color', 'rose'),
    coalesce(p_member ->> 'default_role', 'chef')
  )
  returning id into v_member;

  insert into public.criteria (household_id, label, icon, sort_order) values
    (v_household, 'Taste', 'tongue', 0),
    (v_household, 'Texture', 'layers', 1),
    (v_household, 'Smell', 'steam', 2),
    (v_household, 'Looks', 'sparkle', 3),
    (v_household, 'Portion', 'plate', 4),
    (v_household, 'Temperature', 'flame', 5);

  v_key := private.random_code(20);
  insert into private.household_secrets (household_id, recovery_hash)
  values (v_household, private.hash_key(v_key));

  return jsonb_build_object(
    'household_id', v_household,
    'member_id', v_member,
    'recovery_key', v_key
  );
end
$$;

-- A pairing code. kind 'join' adds the second person; kind 'restore' moves an
-- existing profile onto a new phone.
create function public.create_invite(p_kind text default 'join', p_member_id uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_me public.members;
  v_code text;
  v_expires timestamptz := now() + interval '48 hours';
begin
  select * into v_me from public.members where user_id = v_uid and deleted_at is null;
  if not found then
    raise exception 'not_in_kitchen' using errcode = 'P0001';
  end if;
  if p_kind not in ('join', 'restore') then
    raise exception 'bad_invite_kind' using errcode = 'P0001';
  end if;

  if p_kind = 'join' then
    if (select count(*) from public.members where household_id = v_me.household_id and deleted_at is null) >= 2 then
      raise exception 'kitchen_full' using errcode = 'P0001';
    end if;
    p_member_id := null;
  else
    if not exists (
      select 1 from public.members
      where id = p_member_id and household_id = v_me.household_id and deleted_at is null
    ) then
      raise exception 'member_not_found' using errcode = 'P0001';
    end if;
  end if;

  delete from public.invites
  where household_id = v_me.household_id and (used_at is not null or expires_at < now());

  v_code := private.random_code(10);
  insert into public.invites (code, household_id, kind, member_id, created_by, expires_at)
  values (v_code, v_me.household_id, p_kind, p_member_id, v_me.id, v_expires);

  return jsonb_build_object('code', v_code, 'kind', p_kind, 'expires_at', v_expires);
end
$$;

create function public.join_household(p_code text, p_member jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.invites;
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if exists (select 1 from public.members where user_id = v_uid and deleted_at is null) then
    raise exception 'already_in_kitchen' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.invites
  where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
  for update;

  if not found or v_invite.used_at is not null or v_invite.expires_at < now() then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;

  if v_invite.kind = 'join' then
    if (select count(*) from public.members where household_id = v_invite.household_id and deleted_at is null) >= 2 then
      raise exception 'kitchen_full' using errcode = 'P0001';
    end if;
    insert into public.members (household_id, user_id, name, avatar, color, default_role)
    values (
      v_invite.household_id,
      v_uid,
      coalesce(nullif(btrim(p_member ->> 'name'), ''), 'Taster'),
      coalesce(p_member ->> 'avatar', 'fork'),
      coalesce(p_member ->> 'color', 'sage'),
      coalesce(p_member ->> 'default_role', 'taster')
    )
    returning id into v_member;
  else
    update public.members set user_id = v_uid
    where id = v_invite.member_id and deleted_at is null
    returning id into v_member;
    if v_member is null then
      raise exception 'member_not_found' using errcode = 'P0001';
    end if;
  end if;

  update public.invites set used_at = now() where code = v_invite.code;

  return jsonb_build_object(
    'household_id', v_invite.household_id,
    'member_id', v_member,
    'kind', v_invite.kind
  );
end
$$;

-- Recovery key: the way back in when both phones are gone.
create function public.recovery_peek(p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  select s.household_id into v_household
  from private.household_secrets s
  where s.recovery_hash = private.hash_key(p_key);
  if v_household is null then
    raise exception 'recovery_key_invalid' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'household_id', v_household,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'avatar', m.avatar, 'color', m.color
      ) order by m.created_at), '[]'::jsonb)
      from public.members m
      where m.household_id = v_household and m.deleted_at is null
    )
  );
end
$$;

create function public.recover_member(p_key text, p_member_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if exists (select 1 from public.members where user_id = v_uid and deleted_at is null) then
    raise exception 'already_in_kitchen' using errcode = 'P0001';
  end if;
  select s.household_id into v_household
  from private.household_secrets s
  where s.recovery_hash = private.hash_key(p_key);
  if v_household is null then
    raise exception 'recovery_key_invalid' using errcode = 'P0001';
  end if;

  update public.members set user_id = v_uid
  where id = p_member_id and household_id = v_household and deleted_at is null
  returning id into v_member;
  if v_member is null then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  return jsonb_build_object('household_id', v_household, 'member_id', v_member);
end
$$;

create function public.rotate_recovery_key() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_household uuid;
  v_key text;
begin
  select household_id into v_household
  from public.members where user_id = auth.uid() and deleted_at is null;
  if v_household is null then
    raise exception 'not_in_kitchen' using errcode = 'P0001';
  end if;
  v_key := private.random_code(20);
  insert into private.household_secrets (household_id, recovery_hash)
  values (v_household, private.hash_key(v_key))
  on conflict (household_id) do update
    set recovery_hash = excluded.recovery_hash, rotated_at = now();
  return jsonb_build_object('recovery_key', v_key);
end
$$;

-- Everything that changed since the cursor, in one round trip. Runs with the
-- caller's rights, so row-level security decides what comes back.
create function public.sync_pull(p_since timestamptz default null) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'server_time', now(),
    'households', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.households t
                   where p_since is null or t.updated_at > p_since),
    'members', (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id'), '[]'::jsonb) from public.members t
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
               where p_since is null or t.updated_at > p_since)
  )
$$;

-- Who am I in this kitchen? Null when this phone is not paired yet.
create function public.my_membership() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('household_id', m.household_id, 'member_id', m.id)
  from public.members m
  where m.user_id = (select auth.uid()) and m.deleted_at is null
  limit 1
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_household(text, jsonb)',
    'public.create_invite(text, uuid)',
    'public.join_household(text, jsonb)',
    'public.recovery_peek(text)',
    'public.recover_member(text, uuid)',
    'public.rotate_recovery_key()',
    'public.sync_pull(timestamptz)',
    'public.my_membership()'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

-- -------------------------------------------------------------- realtime ----

do $$
declare
  t text;
begin
  foreach t in array array['households', 'members', 'dishes', 'menus', 'servings', 'reviews', 'criteria', 'photos']
  loop
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end
$$;

-- --------------------------------------------------------------- storage ----

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 3145728, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy "kitchen members read photos" on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] in (select h::text from private.my_household_ids() h)
  );

create policy "kitchen members add photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] in (select h::text from private.my_household_ids() h)
  );

create policy "kitchen members replace photos" on storage.objects for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] in (select h::text from private.my_household_ids() h)
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] in (select h::text from private.my_household_ids() h)
  );
