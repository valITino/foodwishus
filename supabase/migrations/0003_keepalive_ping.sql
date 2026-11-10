-- Free Supabase projects pause after about a week without activity. A scheduled
-- GitHub workflow calls this harmless function every two days to keep ours awake.
-- It reveals nothing but the server's clock.

create function public.ping() returns timestamptz
language sql stable security invoker set search_path = ''
as $$ select now() $$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
