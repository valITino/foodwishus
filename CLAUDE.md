# FoodwishUs: working notes for Claude

A private, mobile-first meal app for two (Android, installable PWA). She proposes and
cooks, he ranks, eats, photographs and rates. Slogan: "U cook. I eat."

Read `PLAN.md` (milestones), `DECISIONS.md` (why things are the way they are) and
`docs/SPEC.md` (the product brief) before larger work.

## Commands

```bash
npm run dev         # dev server with a pretend cloud (never touches real data)
npm run typecheck
npm test            # vitest unit tests
npm run e2e         # Playwright, Android viewport, against the dev server
npm run build       # production build (talks to Supabase), also writes dist/sw.js
npm run e2e:pwa     # offline, update note, install and push tests against the production build
npm run build:push  # bundles the push Edge Function into one file for deploying
npm run build:ai    # the same for the helper function (recipes from links)
node tools/shots.mjs <outDir> [scale]   # screenshots; needs the dev server running
```

Run several dev servers side by side with `FOODWISHUS_PORT=5180 npm run dev` (the e2e
config and the screenshot tool read the same variable).

## How the app is put together

- `src/data/types.ts` is the shared vocabulary. Rows are camelCase in the app.
- **Reading:** screens use hooks from `src/data/queries.ts` (and `useMe`, `usePhotoUrl` in
  `hooks.ts`). They return `undefined` while loading and update live.
- **Writing:** screens call functions from `src/data/actions.ts`. Never write to Dexie
  directly from a screen. Photos go through `src/data/photos.ts`. Rows of one table that
  change together (renumbering a list) are saved with `store.patchAll`, never in a loop of
  `store.patch`: every single write repaints the screen, and half a renumbering shuffles it.
- `src/data/sync.ts` pushes the outbox and pulls changes. Screens never talk to the backend,
  except logging in and the admin's tools, which go through `startKitchen` / `joinKitchen` /
  `logIn` / `logOut` and `backend` in `src/data/app.ts`.
- **People:** a person is a profile (`members`), a device is a login. One profile can be
  logged in on many devices; name + PIN logs in (`src/data/pin.ts`). Whoever opened the
  kitchen is the admin (`Member.isAdmin`). A paused profile has `disabledAt` set. Language,
  theme and calories live in `Member.prefs` and follow the person (`src/app/settingsSync.ts`).
- `src/app/router.ts`: hash routes. `navigate('/recipes/new')`, `back('/recipes')`,
  `useRoute()`, `matchPath('/recipes/:id', path)`.
- `src/app/Shell.tsx` owns tabs, the add sheet, toasts and the demo banner.
- **Demo kitchen:** `enterDemo()` / `leaveDemo()` switch to a separate local database with
  sample content (`src/data/demo`). Handy for screenshots: set
  `localStorage['foodwishus.prefs'] = '{"demoData":true}'` before loading. Add
  `"demoEmpty":true` for the same kitchen without sample content (tests that need a clean table).
- **Offline and push:** the service worker is `src/sw/sw.ts` (production build only). Push:
  `src/data/push.ts` on the device, `supabase/functions/push` on the server, triggers in
  `0007_push.sql`. Setting it up is described in `supabase/functions/push/README.md`.
- The database is live with the users' real kitchen. Never run tests or experiments against
  it; schema changes go through a migration the owner approves.
- **Backup:** the rules (what is in the file, what an import may do) are pure functions in
  `src/data/backup.ts`; `backupFile.ts` packs and reads the zip (`zip.ts`, no library).
  An import only adds, writes through the store and never touches people.
- **The bell:** `src/data/news.ts` decides what an arriving change is worth telling; the sync
  writes the lines into the local `news` table while it applies a pull (never on the first
  one). `src/features/news` words and shows them. Nothing about it lives in the cloud.
- **The helper (AI):** the Edge Function `supabase/functions/ai` reads a recipe from a link
  and answers with a recipe card; `README.md` there has the owner's steps. What the AI is
  told lives in `skills/` (house rules plus one file per job: instructions, the form of the
  answer, and a reader that checks it). The Claude API key is a secret of the function and
  never appears in the app, the repository, a test or a chat. Screens reach the helper
  through `src/data/helper.ts`; the pretend cloud runs the same handler with a pretend web
  (`src/data/fake/pretendWeb.ts`). A card only ever fills the dish form
  (`src/features/recipes/importLogic.ts`): the AI never writes to the kitchen by itself.
- **Basket and pantry:** two synced tables that came later (`LATER_TABLES` in `types.ts`,
  migration 0009). A cloud without them makes their changes wait (`SyncStatus.later`), never
  refuses them. The rules (same thing, adding, clearing into the pantry) are pure functions in
  `src/data/basket.ts`; what the plan asks for is in `src/features/basket/logic.ts`; Fork's
  check is `src/features/basket/fork.ts` (the helper when it can, names when it cannot) and
  runs by itself from `watch.ts`, only on the phone that changed the plan. Fork only ever
  writes suggestions (`state: 'suggested'`): people put things on the list.
- **Refused changes** (`deadLetters`) leave the list only through `sync.retryRefused` and
  `sync.discardRefused`; `src/data/refused.ts` puts them into words for the Sync page.
- The real backend is Supabase (`supabaseBackend.ts`); rules live in `supabase/migrations`.
  The pretend cloud in `src/data/fake` must follow the same rules. Never point tests at
  the real project.

## Rules

- **Copy:** every string the user sees is translated (English and German). Shared words
  live in `src/i18n/en.ts` / `de.ts`; feature copy lives next to the feature and is read
  with `useCopy({ en: {...}, de: {...} })`. Sentence case, plain verbs, no filler. A button
  says what happens ("Save dish"), and the toast afterwards uses the same word ("Saved").
  Errors say what went wrong and how to fix it. No em dashes in copy.
- **Design:** build only from `src/ui/components` and `src/ui/deco`; see them all at
  `/#/styleguide`. Tokens are in `src/ui/styles.css`. Paper and fabric: flat colour and
  hairlines, no gradients. Only floating things get `shadow-float`. One main (rose) button
  per screen. At most one deco object per screen area. Handwriting font (`font-script`) only
  for quotes and notes. No all-caps labels, no middle-dot separators, no arrows on buttons.
- **Card padding:** pass `pad={false}` to `Card` when you set your own spacing. Do not
  fight `p-4` with another padding class.
- **Phone first:** design for 360 to 430 px wide. Touch targets at least 44 px. Every
  control has a label (`aria-label` for icon buttons). Text contrast AA in light and
  candlelight: on a cherry ground use `text-on-cherry`, never `text-white`; soft and rose
  text on `bg-blush` gets its deeper ink by itself. Respect reduced motion (the global CSS
  already shortens animations). `tests/e2e/a11y.spec.ts` guards names, sideways scroll and
  the one h1 on every screen: add new screens to its list.
- **Motion answers actions.** No entrance animations on every card.
- **Calories:** show them only when `usePref('showCalories')` is true. Neutral wording, no
  targets or warnings.
- **Dates:** the kitchen lives in Europe/Zurich. Use `src/lib/dates.ts`.
- **Wishlist order:** `byPriority` (plain string comparison of fractional indexes).
- **Tests:** unit tests for logic, a Playwright spec for each user flow. Wait for visible
  results, never for timers. That includes every single key: when reordering with the
  keyboard, wait for the spoken answer ("… is now number 2 of 3.") before the next arrow.
  CI presses faster than this workspace, and a key sent before the screen has caught up is lost.
- **Verify by looking:** take screenshots in light and candlelight at 412 x 915 and fix
  what looks off before calling a screen done.
- Commits end with the attribution lines used in `git log`.
