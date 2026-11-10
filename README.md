# FoodwishUs

**U cook. I eat.** A private meal app for two: she proposes and cooks, he ranks, eats,
photographs and rates, and both get a stats cockpit.

The app is a web app that installs to the Android home screen. Your data lives on your
phones and syncs through a free Supabase project. There is no server of your own to run.

## Where things stand

The foundation is built: the database and its security rules, offline storage and sync,
and the design system. The real screens come next. See [PLAN.md](PLAN.md) for the
milestones and [DECISIONS.md](DECISIONS.md) for the why behind each choice.

Once deployed, the app lives at `https://valitino.github.io/foodwishus/`:

- `/#/styleguide` shows the whole design system, with switches for candlelight mode and German.
- `/#/preview/today` shows a sample Today screen.

## One-time setup (three switches)

1. **GitHub, make the repository public:** Settings → General → Danger Zone → Change visibility.
   Only the code becomes visible. Meals and photos stay private in Supabase.
2. **GitHub, turn on hosting:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. **Supabase, allow phone logins:** Authentication → Sign In / Providers → turn on
   **Allow anonymous sign-ins**. The app has no email or password: each phone gets its own
   invisible login, and you pair the two phones with a code.

## Installing on Android

Open the app link in Chrome, tap the menu (three dots), then **Install app** (or
**Add to Home screen**). It then opens like any other app.

## Pairing and recovery (from milestone 3)

- The first person taps **Start our kitchen** and shows a QR code or invite link.
- The partner scans it. Done: both phones now share one kitchen.
- New phone? The partner creates a **restore** code in Settings, and the old profile moves over.
- Both phones gone? The **recovery key**, shown once when the kitchen is created, gets you back in.
  Write it down.

## Running costs

Zero. GitHub Pages hosts the app and Supabase's free plan holds the data
(500 MB database and 1 GB of photos, roughly 2,500 meal photos).

A free Supabase project pauses after about a week without activity. Two automatic
keep-alive pings prevent that. If it ever pauses anyway, open the Supabase dashboard and
press **Restore project**. Nothing is lost.

## For developers

```bash
npm install
npm run dev        # http://localhost:5173, with a pretend cloud built into the dev server
npm test           # unit tests: sync engine, pairing rules, conflict handling
npm run e2e        # two simulated Android phones syncing, one of them offline
npm run build      # production build (talks to Supabase)
npm run icons      # regenerate app icons from the mascot
```

Development never touches real data: `npm run dev` and all tests use a pretend cloud
(`src/data/fake`) that follows the same rules as the database in `supabase/migrations`.
Open `/#/lab` in two browser windows to play with sync by hand.

| Folder | What lives there |
| --- | --- |
| `src/data` | Types, local database, outbox, sync engine, Supabase adapter |
| `src/ui` | Design tokens, components, the deco kit and Fork the mascot |
| `src/features` | Screens |
| `src/i18n`, `src/content` | English and German copy, quotes |
| `supabase/migrations` | Database schema and security rules, in order |
| `supabase/tests` | Security test to run in the Supabase SQL editor |
| `brand` | Logo files |
