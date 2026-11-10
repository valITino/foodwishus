-- Second keep-alive, from inside the database: once a day it calls its own public
-- API. It uses only the publishable key (public by design). The GitHub workflow in
-- .github/workflows/keepalive.yml does the same from outside.

create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'foodwishus-keepalive',
  '41 4 * * *',
  $job$
    select net.http_post(
      url := 'https://cxdygkvkkmddwbvtnmyg.supabase.co/rest/v1/rpc/ping',
      headers := jsonb_build_object(
        'apikey', 'sb_publishable_IfRq8TQ60_aota-yBYxDgQ_TumFeC_6',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    )
  $job$
);
