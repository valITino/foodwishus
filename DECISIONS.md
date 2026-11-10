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
the queue moves on. If the rejection is because the phone was unpaired, nothing is set aside:
the phone shows "needs pairing again" and keeps its unsent work.

## 2. Sign-in: invisible phone logins and pairing codes, not email

The original plan was an emailed one-time code. Supabase's built-in email service only
delivers to members of the Supabase project team and is tightly rate-limited, so a partner's
address would simply never receive the code without setting up a separate email provider.

Instead each phone signs in anonymously (no email, no password) and joins the kitchen with a
10-character invite code, shown as a QR code or link. This is also closer to the original
wish: "pairing like Bring!, ideally no email and password".

- **New phone:** the partner creates a restore code; the profile moves to the new phone and
  the old phone is locked out.
- **Both phones lost:** a 20-character recovery key, shown once when the kitchen is created.
  Only its hash is stored.
- **Cost:** clearing the browser's site data signs the phone out. Recovery is one of the two
  paths above. The app asks Android to keep its storage (`navigator.storage.persist()`).

Needs one switch in Supabase: Authentication → Sign In / Providers → Allow anonymous sign-ins.

## 3. One kitchen, two seats

The repository and the publishable key are public, so anyone could create an anonymous login
against the project. That login can do nothing:

- Row-level security limits every row and photo to kitchen members.
- `create_household` works only while no kitchen exists. `join_household` needs a valid,
  unused, unexpired code, and a kitchen has at most two members.
- A nightly job deletes anonymous logins that never paired.

The security test in `supabase/tests/security_test.sql` plays a stranger against the real
database. Known and accepted: Supabase's advisor flags the pairing functions as "security
definer functions callable by signed-in users". They are the pairing API and check the
caller themselves. It also flags `public.rls_auto_enable()`, which came with the project.

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
- **Service worker: later (M6), probably `vite-plugin-pwa`.** Until then the app needs a
  connection to open, though data already survives offline once open.

## 8. Built where Supabase cannot be reached

The workspace used to build this cannot connect to Supabase from its shell or browser. So:

- Database rules were applied and tested through the Supabase connector.
- All sync logic runs against a pretend cloud (`src/data/fake`) with the same rules and error
  codes. Keep it in step with `supabase/migrations`.
- `src/data/supabaseBackend.ts` is deliberately thin. Its first real run is on your phones.

## 9. If Supabase ever goes away

The data is plain Postgres tables plus JPEG files. Export and import (JSON plus a photo zip)
arrive in M7. The app talks to the cloud through one small interface (`src/data/backend.ts`),
so another backend means rewriting one file, not the app.

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
- **Recovery key and restore codes** (the spec asked for a recovery path; this is it, in full).
- **Lock-out protection:** an unpaired phone never throws away unsent work.
- **Quote of the day:** the same quote all day, a new one tomorrow.
- **`/#/lab`** in development: a workbench to watch sync between two browser windows.
