-- Housekeeping. The app signs phones in anonymously, so anyone who finds the public
-- key could create empty logins. They can read and write nothing, and this job sweeps
-- away logins that never paired with the kitchen.

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'foodwishus-purge-stray-logins',
  '17 3 * * *',
  $job$
    delete from auth.users u
    where u.is_anonymous
      and u.created_at < now() - interval '2 days'
      and not exists (select 1 from public.members m where m.user_id = u.id)
  $job$
);
