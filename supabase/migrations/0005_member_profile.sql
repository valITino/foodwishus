-- Profiles: a short status line the partner sees ("Always Huuungryyyyy") and an
-- accessory for the avatar maker. Each person can edit only their own.

alter table public.members
  add column status text check (status is null or char_length(status) <= 60),
  add column accessory text check (accessory is null or char_length(accessory) <= 24);

grant update (status, accessory) on public.members to authenticated;
