# Decisions

Each choice, why it was made, and what it costs.

## 1. Sync: Supabase plus a local-first layer of our own

The app reads everything from a database on the phone (IndexedDB through Dexie), so screens
open instantly and work offline. Every change is also queued in an outbox and sent to
Supabase when there is a connection. The other phone picks changes up through Supabase
Realtime, on app focus, on reconnect, and on a one-minute timer.

Sync is asynchronous: the two phones never need to be online at the same time.

| Option | Why not |
| --- | --- |
| Pure P2P (WebRTC) | Both phones must be online at the same moment, and it still needs signaling and relay servers |
| Native Android app + Firebase | Sideloading or a Play developer account; Firebase file storage now needs a billing account |
| InstantDB | Its cloud service shuts down on 31 August 2027 |
| Jazz | Strong local-first design, but mid-rewrite with two APIs. Plan B |
| PowerSync | An extra moving part on top of Postgres; free projects deactivate after a week |

**Conflict rules.** Edits travel as patches holding only the changed fields, so two people editing
different fields of one dish both win. Same field: the change that reaches the cloud last wins.
Wishlist order uses fractional indexes. Rows are never hard-deleted, only marked `deleted_at`.
A change made while a sync pass is running is re-applied on top of what the pass brings in.

**Refused changes.** If the cloud rejects a change three times it is set aside (not dropped) and
the queue moves on. If the rejection is because the device was logged out or its profile
paused, nothing is set aside: the device says so and keeps its unsent work. Every pull tells
the device whether it still has its seat, and before sending anything it asks first.

## 2. Sign-in: a name and a PIN, not email

The original plan was an emailed one-time code. Supabase's built-in email service only
delivers to members of the Supabase project team and is tightly rate-limited, so a partner's
address would simply never receive the code without setting up a separate email provider.

Instead each device signs in anonymously (no email, no password). That invisible login is
then tied to a person's profile, and one profile can have several devices.

- **First time:** the first person opens the kitchen; the second joins with a 10-character
  invite code, shown as a QR code or link. Both choose a six-digit PIN.
- **Any other device:** name and PIN. The profile, its settings and the kitchen come along.
- **Forgotten PIN:** the admin makes a one-time restore code. Using it sets a new PIN and
  logs the profile's other devices out (one of them may be the lost phone).
- **Everything lost, including the admin's PIN:** the owner of the Supabase project runs
  `select private.rescue_code('Name')` in the SQL editor. It cannot be reached from the app.
- **Cost:** clearing the browser's site data logs the device out. Name and PIN bring it back.

This replaced a 20-character recovery key that had to be written down. The users asked for
something lighter, and for being recognised on every device.

**Why six digits, and why a lock.** The app's address and its public key are public, so the
PIN is the only thing between a stranger and the kitchen. Wrong tries are counted per typed
name, whether that name exists or not: five tries, then a pause of 15 minutes that doubles
up to a day. That leaves a guesser about five tries a day against a million PINs. A wrong PIN
and an unknown name give the same answer and take the same time, so strangers cannot find out
who lives here. The obvious PINs (000000, 123456, 121212 and the like) are refused. PINs are
stored as bcrypt hashes in a schema the API cannot see.

Known and accepted: somebody who knows a name can keep that name paused for new log-ins.
Devices that are already logged in are not affected, and a restore code lifts the pause.

**Settings follow the person.** Language, candlelight and the calorie switch are saved on the
profile and applied when a device logs in (`src/app/settingsSync.ts`).

Needs one switch in Supabase: Authentication → Sign In / Providers → Allow anonymous sign-ins.

## 2b. One admin

Whoever opens the kitchen is its admin. Only the admin can invite the second person, make a
restore code, pause the partner's profile and log the partner out everywhere. The partner
can do none of that to the admin. Pausing shuts the profile out of every rule at once (it
simply stops counting as a member) and deletes nothing; switching it back on needs no new
log-in, and the paused device delivers what it wrote in the meantime.

The admin flag and the paused flag cannot be edited by the app at all. They change only
through database functions that check who is asking.

## 3. One kitchen, two seats

The repository and the publishable key are public, so anyone could create an anonymous login
against the project. That login can do nothing:

- Row-level security limits every row and photo to kitchen members.
- `create_household` works only while no kitchen exists. `join_household` needs a valid,
  unused, unexpired code, and a kitchen has at most two members. Logging in needs a name and
  its PIN (see above).
- A nightly job deletes anonymous logins that belong to no profile, and old wrong-try counters.

Because the first person to open the kitchen becomes its admin, open it yourself right
after the first deploy.

The security test in `supabase/tests/security_test.sql` plays a stranger against the real
database. Known and accepted: Supabase's advisor flags the log-in and admin functions as
"security definer functions callable by signed-in users". They are the log-in API and check
the caller themselves. It also flags `public.rls_auto_enable()`, which came with the project.

## 4. Photos

Shrunk on the phone to at most 1600 px and about 80% JPEG quality (target under 400 KB), plus
a 400 px thumbnail. Stored in a private bucket under `photos/<kitchen>/<photo>.jpg`. Uploads
queue while offline. Thumbnails of all photos and full-size versions of the last 60 days are
kept on the phone for offline viewing; older full-size photos load on demand.

## 5. Hosting: public repository on GitHub Pages

Free, no extra account, deploys on every push to `main`. The code is public. The data is not:
it sits in Supabase behind the rules above. Only the publishable key is in the code, which is
designed to be public.

## 6. Keeping the free Supabase project awake

Free projects pause after about seven days without activity. Two pings call a harmless
`ping()` function: a scheduled GitHub workflow every two days, and a daily job inside the
database itself. Limits: GitHub switches scheduled workflows off after 60 days without
repository activity (it emails first), and it is not documented which kinds of activity
Supabase counts. If the project pauses anyway, "Restore project" in the dashboard brings it
back with all data.

## 7. Small dependencies on purpose

- **No router library.** Five tabs and a few sheets need a 15-line hash router. Hash routes
  also work on GitHub Pages without redirect tricks.
- **A tiny typed i18n instead of a library.** Messages are plain objects, so a missing German
  string is a compile error.
- **Hand-drawn SVG for all artwork.** No icon font, no stock art, nothing to license.
- **No chart library.** The Cockpit's sixteen charts are small SVG components drawn with the
  design tokens, so they look like the rest of the app and add little to the download.
- **A hand-written service worker** (`src/sw/sw.ts`, file list made at build time by
  `tools/serviceWorkerPlugin.ts`) instead of a plugin with the Workbox tree: push and the
  update rules need a custom worker anyway. The page is fetched fresh when online (three
  seconds at most, then the saved copy), built files come from the cache. A new version waits
  and the app offers "Reload"; it never reloads by itself.
- **Web Push without a library.** The encryption (RFC 8291) and the signing (RFC 8292) are
  written on Web Crypto and checked against the RFC's worked example.

## 7b. Push notifications: nobody copies a secret

A database trigger notices the five events worth telling (proposed, planned, served, verdict
handed in, the cook's answer) and calls the Edge Function `push` through `pg_net`. The
function works out who should hear about it, writes the words in their language and sends.

Everything the function needs lives in one row in the private schema: where it is, a shared
secret the triggers send along (made inside the database), and the VAPID key pair (made by the
function the first time it is asked). The function itself only has what Supabase gives every
function, and fetches the rest with the service role. So setting push up is three SQL
statements and one deploy, with no key ever typed, pasted or seen by anyone
(`supabase/functions/push/README.md`).

A subscription belongs to the device login that made it, so any log-out (own, by the admin,
by a restore code) stops that device's notifications at once. A notification is a nicety:
triggers never make a write fail, nothing is retried, and stale news is dropped.

## 8. Built where Supabase cannot be reached

The workspace used to build this cannot connect to Supabase from its shell or browser. So:

- Database rules were applied and tested through the Supabase connector.
- All sync logic runs against a pretend cloud (`src/data/fake`) with the same rules and error
  codes. Keep it in step with `supabase/migrations`.
- `src/data/supabaseBackend.ts` is deliberately thin. Its first real run was on the users'
  phones on 10 Nov 2026: opening the kitchen, joining by link and syncing worked.

## 9. If Supabase ever goes away

The data is plain Postgres tables plus JPEG files. Settings has a backup that puts all of
it into one file and brings it back into any kitchen (see 10). The app talks to the cloud
through one small interface (`src/data/backend.ts`), so another backend means rewriting one
file, not the app.

## 10. The backup file

One zip: `backup.json` (a format version, the kitchen's name, the date, every row) and the
photos next to it as plain JPEGs. It opens with any zip tool, so the pictures are never
locked inside the app.

- **No zip library.** The file is written without compression (JPEGs do not shrink) and
  read through its table of contents, in about 200 lines of our own (`src/data/zip.ts`).
  The bundle gains nothing, photos are never held in memory as one piece, and looking at
  what a backup holds never reads the pictures.
- **An import only ever adds.** A row the kitchen does not have is added. A row it has is
  left alone unless the file's copy is newer. Nothing is deleted. Everything is written
  through the store, so it syncs like any other change, and running the same import twice
  finds nothing to do.
- **Deleted since the backup comes back.** A restore that cannot bring back what was
  deleted by mistake is not worth much. The preview says how many entries return. Cost:
  things deleted on purpose return too, and have to be deleted again.
- **People are never imported.** The file only notes who was who (name and role), so
  that in another kitchen a review still belongs to the right person: matched by profile,
  then by name, then by role. A review moved to another profile gets that profile's id for
  it, so it can still be edited and never exists twice.
- **Criteria are matched by name.** A kitchen that already asks about "Taste" does not
  get a second "Taste"; the file's scores are counted under the one that is there. Renamed
  criteria arrive as extra ones, and the preview says so.
- **Old photos.** A phone keeps full-size photos for 60 days and thumbnails after that.
  For a backup the full size is fetched from the cloud. Offline, the thumbnail goes in
  alone and the app says how many photos that concerns.
- A file from a newer app, a file that is not a backup and a damaged file are each
  refused with their own sentence, before anything is written.

## 11. Changes the cloud refuses

A refused change is set aside after three tries (see 1). The Sync page lists each one in
words ("A change to the dish Rösti") with two ways out. **Try again** sends a new row as
it is on the device now, or applies an edit again. **Discard** drops an edit; a new row
that never reached the cloud leaves the device too, after asking the cloud whether it
really does not have it (so discarding something new needs a connection). Nothing leaves
that list by itself.

## 12. Plans change: the short ways

The written flow is wish, hearts, plan, served, proof. Real evenings skip steps, so every
step has a shortcut, and none of them needs a new rule in the cloud (any member of the
kitchen may change a meal; only verdicts are guarded).

- **A meal for today.** One sheet ("What shall it be?") fills a slot of the calendar with a
  wish, a meal that was planned for another moment (it moves), anything from the recipe
  book, or a new dish made from the name typed into the search field. It opens from the
  plus button, from an empty Today and from an empty slot in Our Week. A meal picked from
  the book is stored as planned in one write, so the partner hears "planned", not "proposed".
- **Serving early.** The cook may serve any meal that is still ahead. It counts for the day
  it came to the table; the planned day is kept only so that "Undo served" can put it back.
- **Who cooks** can be swapped while no verdict exists. The hearts are cleared, because the
  Cockpit pairs them with the eater's rating.
- **Skipping from the table.** A served meal used to have no way out except "Undo served"
  on the cook's phone. Either of them can now skip it. Bringing it back forgets that it
  was served.
- **Removing an eaten meal** takes its photos and verdict with it and is allowed while the
  verdict is not sealed. The seal means "this is history now", for the meal as for the verdict.
- **Cook mode ends with "Served"** for the meal of that dish that is on its way with this
  cook, or a new one. If the dish is only on the list as something the partner cooks, the
  button is not offered.

Kept as they are, on purpose: the proof photo is the Taster's (the cook cannot add it), and
a meal needs a photo to count as eaten. Both are the game's rules, not oversights.

Known and accepted: the 24 hours start when the first face is tapped, not when the meal is
handed in. A face tapped one day and handed in the next leaves less time to change it.

## Limits to know

| Limit | Value | What happens at the limit |
| --- | --- | --- |
| Database | 500 MB | Far away: text only |
| Photo storage | 1 GB | About 2,500 photos; old photos would need exporting and pruning |
| Egress | 5 GB a month | Photos are cached on the phones, so each is downloaded once |
| Inactivity | about 7 days | Project pauses; keep-alive pings prevent it |

Figures as published in November 2026. Check them again before relying on them.

## Extras

Things added beyond the written spec. Keep or veto.

- **Fork has moods:** heart-eyed, happy, asleep. He naps on empty screens.
- **Candlelight mode** with sticker-style artwork (cream outlines) so the deco stays visible.
- **Awning and doily:** the scalloped edge appears twice, on the header and the tab bar.
- **Stitched notes:** her notes to him look embroidered.
- **Candy buttons** that squash when pressed, with a small vibration on Android.
- **A sync line** on Today: "All synced", "2 changes waiting", "Offline. Saved on this phone."
- **PIN log-in on any device, an admin, restore codes and an owner's master key** (the spec
  asked for a recovery path; this is it, in full).
- **Lock-out protection:** a logged-out or paused device never throws away unsent work.
- **Icons for review criteria**, shown on the review sheet next to each row of spoons.
- **Focus follows you:** a sheet takes the keyboard focus and gives it back, and a new
  page hands it to its title, so screen readers say where you are.
- **Quote of the day:** the same quote all day, a new one tomorrow.
- **`/#/lab`** in development: a workbench to watch sync between two browser windows.
