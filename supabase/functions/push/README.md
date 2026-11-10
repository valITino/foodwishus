# Push notifications: switching them on

The partner gets a notification when a dish or menu is proposed, a meal is planned,
something is served ("Proof needed!"), a verdict is handed in, or the cook answers it.

How it travels:

1. A change reaches the database. A trigger (`supabase/migrations/0007_push.sql`) notices
   one of the five events and asks `pg_net` to call this function once the change is saved.
2. This function looks up who should hear about it (the other person, on every device
   that did not mute this kind), writes the words in their language and sends each
   device one Web Push message, signed with our VAPID key.
3. The service worker on the phone (`src/sw/sw.ts`) shows the notification and opens the
   right page on a tap.

Until step 6 below is done, the triggers do nothing. The migration is safe to apply first.

## What you need

- The Supabase connector (or the dashboard) for the project in `.env.production`.
- Node 22 on any machine, to make the keys.

Nothing below belongs in the repository except one public key (step 7).

## Steps

### 1. Apply the migration

Apply `supabase/migrations/0007_push.sql` as it is (migration name `push`).

Optional check: run `supabase/tests/push_test.sql` as one SQL statement. It ends with
an error on purpose. The error message is the report, `PUSH REPORT (rolled back)`,
followed by 34 lines that should all start with `ok`. It builds its own throwaway
kitchen, rolls everything back and sends nothing, so it is safe next to the real kitchen.

### 2. Make the keys

```bash
node tools/make-vapid-keys.mjs
```

It prints three values and saves nothing:

- `VAPID_PUBLIC_KEY`: public. It goes into the function's secrets and into the app (step 7).
- `VAPID_PRIVATE_KEY`: secret. Only into the function's secrets.
- `PUSH_SECRET`: secret. Into the function's secrets and into the database (step 6).

Run it once. New keys later mean every phone signs up again by itself the next time
the app is opened, so nothing breaks, but there is no reason to.

### 3. Set the function's secrets

Four secrets, under Edge Functions, Secrets:

| Name | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY` | from step 2 |
| `VAPID_PRIVATE_KEY` | from step 2 |
| `VAPID_SUBJECT` | `mailto:` and an address you read, for example `mailto:you@example.org`. Push services use it to reach the sender if something is wrong. |
| `PUSH_SECRET` | from step 2 |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are there already: Supabase gives them to
every function.

### 4. Deploy the function

Name: `push`. Entry point: `index.ts`. Files: `index.ts`, `handler.ts`, `logic.ts` and
`webpush.ts` from this folder (it imports nothing else and no libraries).

**Turn JWT verification off** (`verify_jwt: false`). The database calls the function
without a login. The function checks the shared secret itself and refuses everything else.

### 5. Check that it refuses strangers

```bash
curl -i -X POST https://<project-ref>.supabase.co/functions/v1/push -d '{}'
```

Expected: `401` and `{"error":"wrong_secret"}`. A `500` with `not_set_up` means one of
the four secrets is missing or misspelled.

### 6. Tell the database where the function lives

One statement, in the SQL editor. Put in the project's reference and the `PUSH_SECRET`
from step 2:

```sql
insert into private.push_config (function_url, secret)
values ('https://<project-ref>.supabase.co/functions/v1/push', '<PUSH_SECRET>')
on conflict (only_row) do update
set function_url = excluded.function_url, secret = excluded.secret, updated_at = now();
```

From now on the five events call the function. The table lives in the `private` schema,
which the API cannot read.

### 7. Give the app the public key

Add one line to `.env.production`, commit and push (that deploys the app):

```
VITE_VAPID_PUBLIC_KEY=<VAPID_PUBLIC_KEY from step 2>
```

The public key is safe to publish. Without this line the app says "Notifications are
not set up for this kitchen yet" and offers nothing to tap.

### 8. Turn them on, on each phone

Settings, Notifications, "Turn on notifications", then "Allow" when Chrome asks. Each
device is turned on by itself, and each can mute any of the five kinds.

## Checking that it works

Have one person propose a dish while the other has notifications on. Then look at what
the function answered:

```sql
select id, status_code, content::text, created
from net._http_response
order by created desc
limit 5;
```

- `200` with `{"type":"proposed","sent":1,"gone":0,"failed":0}`: delivered to one device.
- `sent: 0`: nobody to tell. The other person has no device signed up, muted this kind,
  is paused, or the news was stale by the time it arrived.
- `gone: 1`: a device's subscription had expired. Its row was removed. The phone signs
  up again by itself the next time the app is opened.
- `failed: 1`: the push service refused. The usual cause is a key mismatch: the public
  key in `.env.production` is not the partner of `VAPID_PRIVATE_KEY`.
- `401`: the secret in `private.push_config` is not the function's `PUSH_SECRET`.
- No row at all: the triggers did nothing. Check `select function_url from private.push_config;`.

The function's own log (Edge Functions, `push`, Logs) shows every call.

## Switching notifications off again

```sql
delete from private.push_config;
```

The triggers go quiet at once. Devices stay signed up, so putting the row back resumes
where it stopped.

## What is in this folder

| File | What it does |
| --- | --- |
| `index.ts` | The Deno entry point. Reads the secrets and hands the request to `handler.ts`. |
| `handler.ts` | Checks the secret, reads the kitchen with the service role, sends, removes devices that are gone. |
| `logic.ts` | The rules, free of any machinery: which changes are events, who gets told, the words in English and German. The pretend cloud for local development runs the same file. |
| `webpush.ts` | Web Push encryption (RFC 8291) and VAPID signing (RFC 8292) with Web Crypto. |

Everything except `index.ts` is covered by unit tests (`tests/unit/push.*.test.ts`), which
run the whole handler against a stand-in database and a stand-in push service and check
the encryption against the example in the RFC. The database side is covered by
`supabase/tests/push_test.sql`.

## Limits to know

- One call per event. The free plan includes 500,000 calls a month.
- A notification is a nicety: if the function is down, the write still goes through and
  the app shows the news the next time it is opened. Nothing is retried.
- Chrome on Android delivers to an installed app and to a plain browser tab alike, as
  long as Chrome itself may show notifications.
