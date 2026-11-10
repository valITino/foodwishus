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
npm run build       # production build (talks to Supabase)
node tools/shots.mjs <outDir> [scale]   # screenshots; needs the dev server running
```

Run several dev servers side by side with `FOODWISHUS_PORT=5180 npm run dev` (the e2e
config and the screenshot tool read the same variable).

## How the app is put together

- `src/data/types.ts` is the shared vocabulary. Rows are camelCase in the app.
- **Reading:** screens use hooks from `src/data/queries.ts` (and `useMe`, `usePhotoUrl` in
  `hooks.ts`). They return `undefined` while loading and update live.
- **Writing:** screens call functions from `src/data/actions.ts`. Never write to Dexie
  directly from a screen. Photos go through `src/data/photos.ts`.
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
  candlelight. Respect reduced motion (the global CSS already shortens animations).
- **Motion answers actions.** No entrance animations on every card.
- **Calories:** show them only when `usePref('showCalories')` is true. Neutral wording, no
  targets or warnings.
- **Dates:** the kitchen lives in Europe/Zurich. Use `src/lib/dates.ts`.
- **Wishlist order:** `byPriority` (plain string comparison of fractional indexes).
- **Tests:** unit tests for logic, a Playwright spec for each user flow. Wait for visible
  results, never for timers.
- **Verify by looking:** take screenshots in light and candlelight at 412 x 915 and fix
  what looks off before calling a screen done.
- Commits end with the attribution lines used in `git log`.
