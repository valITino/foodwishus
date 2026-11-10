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
3. **Supabase, allow device logins:** Authentication → Sign In / Providers → turn on
   **Allow anonymous sign-ins**. The app has no email or password: each device gets its own
   invisible login, and people are recognised by their name and a six-digit PIN.

## Installing on Android

Open the app link in Chrome, tap the menu (three dots), then **Install app** (or
**Add to Home screen**). It then opens like any other app.

## Getting in, and getting back in

- **The first person opens the kitchen** and becomes its **admin**: pick a role ("I rule the
  stove" or "I'm here to eat"), an avatar, a status line and a six-digit PIN.
- **The partner joins** with the admin's link, QR code or code, and picks the same things.
- **Another phone or a tablet?** Tap **Back to the kitchen**, type your name and your PIN.
  Your profile, your settings (language, candlelight, calories) and the whole kitchen come along.
  You can be logged in on several devices at once.
- **Five wrong PINs** pause that name for 15 minutes, then longer each time (at most a day).
- **Forgot your PIN?** The admin opens Settings → People → "Let back in" and sends a one-time
  code. You pick a new PIN; your other devices are logged out.
- **The admin** can also pause the partner's profile (no log-in, nothing is deleted) and log
  the partner out everywhere, for example after losing a phone.

### The master key (for the owner of the Supabase project)

If the admin forgets their PIN and has no logged-in device left, nobody in the app can help.
You, the owner of the Supabase project, can: open the Supabase dashboard → SQL Editor and run

```sql
select private.rescue_code('Leo');   -- the name of the profile to get back into
```

It answers with a one-time code (valid for 48 hours). Type it on the app's start screen under
"I have a code" and choose a new PIN. This command cannot be reached from the app.

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
npm test           # unit tests: sync engine, log-in and admin rules, conflict handling
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
