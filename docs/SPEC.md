> This is the original product brief. Where it differs from `DECISIONS.md` (for example sign-in: pairing codes, not email), `DECISIONS.md` wins. Milestone status lives in `PLAN.md`.

# Claude Code Prompt — FoodwishUs

## 1. Mission and how to work

Build **FoodwishUs**, a private, mobile-first meal app for two people: my girlfriend and me. Slogan: **U cook. I eat.** She cooks and proposes meals. I rank, schedule, eat, photograph and rate them. We both get a beautiful stats cockpit.

It must feel like a polished consumer app, not a demo. It should be as effortless as the Swiss shopping-list app Bring!: install, invite your partner, everything stays in sync. We both use Android phones and do not want to host, pay for or maintain a server.

**Raise the bar.** You are Claude Fable 5.2: use your full intelligence and creativity on top of everything written here. Treat this prompt as the floor, not the ceiling. Make FoodwishUs feel like it came from an award-winning product team. Wherever you see a better interaction, a more delightful detail or a smarter feature, build it, as long as every requirement here still holds, it stays free to run and stays simple for two people. Sweat the small things: transitions, empty states, copy, haptics, loading moments. List everything you added beyond this spec under "Extras" in `DECISIONS.md`, so we can enjoy or veto it.

How to work (you are running with `/effort ultracode`):

- Start with Phase 0 (section 2). Then write `PLAN.md` before any app code.
- Use sub-agents only for truly parallel workstreams (section 10). Give each a contract first: shared types, design tokens, folder ownership.
- Record every architecture choice and its trade-offs in `DECISIONS.md`.
- Verify, don't assume: run tests, run the app, take Playwright screenshots at phone size and actually look at them.
- Keep scope tight. This is for two people. Prefer boring, well-maintained libraries. A finished v1 beats a half-built v2.
- Library details change fast. Check current docs, maintenance status and pricing on the web before adopting a dependency.
- If something is still ambiguous after Phase 0, pick the simpler option, note it in `DECISIONS.md`, and keep going.

## 2. Phase 0: ask us first

Before planning, ask us these questions as multiple-choice where possible (one or two rounds). After that, build without further questions unless truly blocked.

1. **Setup:** we both use Android (decided). Confirm we have a free Supabase account, then guide us through creating the project step by step (section 6).
2. **Language:** English, German, or both with a switch? We live in Zurich. Keep all strings in i18n files either way.
3. **Us:** our names or nicknames, and avatars (photo or a cute illustrated icon).
4. **Logo:** our logo files go in a brand/ folder. If they are missing, ask us for them before M2. Never replace the logo with a different design.
5. **Review criteria:** confirm the defaults (Taste, Texture/Consistency, Smell/Aroma, Looks, Portion, Temperature) or edit them.
6. **Hosting for the app files:** confirm a free static host (Cloudflare Pages, GitHub Pages, Netlify or Vercel) and whether we already have an account.

## 3. Users, roles and the meal lifecycle

There are exactly two users in one shared household. Roles belong to each meal, not to a person: by default she is the **Chef** and I am the **Taster**, but either of us can propose, cook or review.

A **Dish** is a reusable recipe card. A **Menu** is an ordered set of dishes (starter, main, dessert). Every time a dish or menu is offered and eaten, that is one **Serving**, with its own photo and review. A dish keeps its full history across servings.

Serving lifecycle (use these exact states):

1. **Wishlist**: the Chef proposes a dish or menu, optionally with a sweet note and suggested days. The Taster sets a craving score (1 to 5: how likely I am to want it) and drags it into priority order.
2. **Planned**: a date and slot are set (breakfast, lunch, dinner, dessert/snack).
3. **Served**: the Chef taps "Served" when the food is on the table. The Taster's app shows "Proof needed".
4. **Eaten**: the Taster takes the proof photo, taps an emoji reaction and submits the review. A wax-seal stamp marks it done.
5. **Skipped**: optional exit from Wishlist or Planned, with an optional reason (not hungry, ate out, missing ingredients).

After Eaten, one tap ("Again please!") puts the dish back on the Wishlist as a new Serving.

## 4. Features in detail

Five tabs in a bottom bar: **Today**, **Wishlist**, **Our Week**, **Cockpit**, **Recipe Book**, with a raised center "+" button for adding a dish or menu. Settings sit behind the avatar.

### Today (home)

- Greeting with our names and a rotating quote (section 8).
- Today's planned meal as a hero card.
- A pulsing "Proof needed" card whenever a Serving is in Served.
- The next three items in the queue, plus mini stats: meals this week, current streak.

### Dishes, recipes and menus

- **Add dish:** name (required), short description, cover photo or an illustrated icon from our own set, course, cuisine tags, effort (easy, medium, fancy).
- **Recipe behind every dish:** servings, prep and cook time in minutes, ingredients (quantity, unit, name) that scale with a servings stepper, and step-by-step preparation, each step with an optional timer and photo. Plus free notes and a source link.
- **Calories:** kcal per serving, with optional protein, carbs and fat in grams. Allow "unknown". Nice to have: an estimate from the ingredients via a free nutrition database (for example Open Food Facts), labeled "estimate" and always editable.
- **Cook mode:** full-screen steps with big text, screen kept awake (Wake Lock API), tap-to-start timers and an ingredient checklist.
- **Add menu:** name, pick existing dishes or create them inline, order the courses. Menu calories are the sum of its courses.
- **Propose:** sends a dish or menu to the Wishlist with an optional note ("Extra cheese, just for you") and suggested days.
- **Recipe Book:** every dish with its recipe, searchable, filterable by course, tag, calories and total time; sortable by rating, reactions, times eaten, last eaten and calories.

### Wishlist (the Taster's board)

- Cards sorted by priority. Long-press and drag to reorder, with haptics where supported. Order syncs live to both phones.
- Craving score as 1 to 5 hearts on each card, with microcopy per level.
- Tap a card to plan it: date and slot picker.
- Filter chips: All, Not rated yet, Planned.
- The Chef sees the Taster's order and cravings live. Priority order belongs to the Taster.

### Our Week

- Week view by default, month view as a toggle, slots per day.
- Drag a planned card to another day to reschedule.

### Serve, proof photo, review

1. The Chef taps "Served". The Taster's Today shows "Proof needed" and a push notification arrives.
2. **Proof photo:** opens the camera directly. Gallery upload is allowed as a fallback, but each photo is badged "live" or "from gallery", with the capture time. The capture time becomes eatenAt (editable).
3. The photo appears as a polaroid that develops, with washi tape and a handwritten date caption.
4. Compress on the device: max 1600 px long edge, about 80% quality, target under 400 KB, plus a 400 px thumbnail.
5. **Emoji reaction:** a row of six big buttons from "Kitchen disaster" to "Super delicious", social-media style (section 8). One tap picks the vibe with a bounce and haptic: the fast path while still chewing.
6. **Review sheet:** overall 1 to 5, each active criterion 1 to 5, portions eaten (half, 1, 1.5, 2, "Seconds!"), "Would eat again" yes/no, short comment, quick reaction chips ("More salt", "Perfect", "Too spicy", "Recipe keeper").
7. Submit: wax seal "Eaten with love" stamps down. A 5/5 or "Super delicious" adds heart confetti.
8. The Chef reacts back with her own emoji, a heart or a comment, like under a social media post.

For a menu: one proof photo of the whole table is required, extra photos per course are optional, and each course gets its own rating so dish stats stay accurate. Reviews can be edited for 24 hours, then they are sealed. Nice to have: the Chef gives a secret self-rating before seeing the review, for a "Chef vs Taster" stat.

### Photo wall

All proof photos as a polaroid grid, newest first. Tap one to see its review.

### Settings

Profiles, pairing and re-pairing, review criteria (add, rename, reorder, deactivate), language, theme (light, dark, auto), reduced motion, notifications per type, show or hide calories, export and import backup, demo data on or off.

## 5. Cockpit dashboard

The Cockpit is one scrollable screen of KPI tiles and charts, all driven by one shared filter bar. Every number must match the definitions below.

**Filter bar** (sticky, collapsible): date range presets (this week, this month, last 3 months, this year, all time, custom), dish, menu, course, cuisine tag, who cooked, rating range, emoji reaction, calories, status. Active filters show as removable chips with a "Reset" option.

**KPI tiles:** meals eaten, average overall rating, best-rated dish, most-eaten dish, current and longest streak, skip rate, average days from proposal to eaten, open wishlist count, calories this week, most common reaction.

**Charts:**

- Ratings over time: line chart of overall rating, with a toggle to add each criterion.
- Criteria profile: radar chart for all dishes or one dish, with "compare two dishes".
- Times eaten per dish: horizontal bars, top 10.
- Craving vs reality: scatter of craving score against overall rating (with slight jitter), plus a craving-accuracy score.
- Cuisine and course mix: donut.
- Meal calendar: a contribution-style heatmap made of little hearts.
- When we eat: distribution by weekday and slot.

**Food, calories and timing charts:**

- Calories eaten per day and per week (bars), with average calories per meal by slot.
- When we actually eat: a weekday by hour heatmap from eatenAt, plus planned slot vs actual time.
- Taste vs calories: scatter of overall rating against kcal per serving.
- Effort vs love: total recipe time against rating and reaction.
- Reaction mix: count of each emoji reaction, overall and per dish, plus the reaction trend over time.
- Recipe stats: most cooked recipes, average total time, most used ingredients.

Keep calorie stats informative and neutral: no targets, warnings or judging copy. A Settings toggle hides every calorie number.

**Drill-down:** tapping any dish, bar or point opens Dish detail: photo timeline, all reviews, reaction mix, averages per criterion, times eaten, last eaten, recipe and calories.

**Hall of Fame:** the top 5 dishes as framed polaroids. **Fun facts strip:** auto-generated lines such as "Lasagne has been eaten 7 times. That's love."

**Stat definitions** (implement exactly, each with unit tests):

| Stat | Definition |
| --- | --- |
| Times eaten | Number of Servings of that dish in state Eaten |
| Dish average | Mean overall rating across its eaten Servings; always show n |
| Criterion average | Mean of that criterion wherever it was rated |
| Best-rated dish | Highest dish average with at least 2 Servings; ties go to more Servings, then most recent |
| Craving accuracy | 1 − mean(\|craving − overall\|) / 4, shown as a percent; only Servings with both values |
| Streak | Consecutive calendar days (Europe/Zurich) with at least one Eaten Serving |
| Skip rate | Skipped / (Eaten + Skipped) within the filter range |
| Days to eat | Days between proposedAt and eatenAt |
| Calories eaten | kcal per serving × portions eaten, per Eaten Serving; Servings without kcal count as unknown, never as 0 |
| Average calories per meal | Calories eaten / Eaten Servings with known kcal |
| Eaten time | eatenAt in Europe/Zurich, bucketed by hour and weekday |
| Reaction score | Kitchen disaster = 1 up to Super delicious = 6; a dish's reaction score is the mean, show n |
| Most common reaction | The mode of reactions in range; ties go to the higher score |

All charts must be readable on a 360 px wide Android screen, animate in gently, and have a cute empty state.

## 6. Sync architecture: two Android phones, no server to maintain

We both use Android, so build FoodwishUs as an installable PWA backed by Supabase's free tier, with a local cache that keeps it working offline. This is the most efficient setup that still works reliably every day. Sync is asynchronous: either phone can be offline or asleep. Changes and photos wait in the cloud and arrive, with a push notification, the next time the other phone is online. Re-verify the limits below before building; they were checked on 10 Nov 2026.

**Why this setup:**

- **PWA on Android:** Chrome installs it to the home screen like a real app. No Play Store, no APK sideloading, instant updates. Camera, offline mode and push notifications all work.
- **One codebase you can fully test:** Playwright with Android device emulation covers both phones end to end.
- **Supabase free tier:** Postgres, auth, file storage, realtime and edge functions in one managed service. Published free limits: 500 MB database, 1 GB file storage, 5 GB egress, 500,000 edge function invocations. At about 400 KB per photo, 1 GB holds roughly 2,500 photos.
- **Nothing to maintain:** our only backend code is SQL migrations, row-level security policies and one small edge function. Supabase runs them.

**Options we ruled out** (copy this table into `DECISIONS.md`):

| Option | Why not |
| --- | --- |
| Pure P2P (WebRTC) | Both phones must be online at the same moment, and it still needs signaling and relay servers |
| Native Android app + Firebase | Needs APK sideloading or a Play developer account; Firebase file storage now requires a billing account (Blaze plan); slower to build and test |
| InstantDB | Its cloud service shuts down on 31 August 2027 |
| Jazz | Strong local-first design, but mid-rewrite with two APIs; keep it as plan B |
| PowerSync | An extra moving part on top of Postgres; free projects deactivate after a week of inactivity |

**How it must work:**

- **Local-first feel:** read everything from an IndexedDB cache (Dexie), so screens open instantly and offline. Queue writes in an outbox and replay them on reconnect, idempotently, with client-generated UUIDs. Subscribe to Supabase Realtime so the partner's changes appear live.
- **Photos:** compress on the phone, upload to a private Storage bucket, queue uploads while offline. Cache thumbnails and recent photos for offline viewing.
- **Accounts and pairing:** each of us signs in once with an email one-time code. The first person creates the household and shows a QR code or invite link; the partner scans it and joins. Row-level security limits every row and photo to household members.
- **Push notifications:** a database webhook calls one Supabase Edge Function that sends Web Push (VAPID keys) for: new dish proposed, meal planned, "Served, proof needed!", review posted, Chef replied. Each type can be muted in Settings.
- **Keep-alive:** free Supabase projects pause after about 7 days without activity. Add a free scheduled GitHub Actions workflow that runs a harmless query every 2 days, and document how to restore a paused project (data is kept).
- **Secrets:** only the public anon key ships in the app. The service-role key and the VAPID private key live in Supabase function secrets. Never commit secrets.
- **Conflicts:** last writer wins per field, fractional indexing for priority order, reviews append-only.
- **Backups:** export and import in Settings (JSON plus a photo zip), with a gentle monthly reminder.
- **Storage:** call `navigator.storage.persist()` after install.

**Walk us through setup:** we are not developers. Give step-by-step instructions for creating the Supabase project, linking the CLI, setting secrets, enabling the GitHub keep-alive and deploying the static app (Cloudflare Pages, Netlify or GitHub Pages).

**Prove it before building features:** a spike with two Android-sized browser contexts. One goes offline, both edit, one attaches a photo, they reconnect and converge, and a push reaches the other. Then test once on our real phones.

Checked 10 Nov 2026: [Supabase free-plan pausing](https://supabase.com/kb/faqs/platform/free-project-pausing) · [Supabase free limits (Jet Admin, 2026)](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/) · [Instant cloud shutdown](https://runtimewire.com/article/instant-team-joins-openai-cloud-shutdown) · [Firebase Spark vs Blaze](https://dev.to/androve2k/spark-vs-blaze-the-firebase-pricing-guide-i-wish-id-read-sooner-onb) · [Jazz pricing](https://jazz.tools/pricing) · [PowerSync pricing](https://toolradar.com/tools/powersync/pricing)

## 7. Design direction: modern, minimal, sweet, traditional

The look is "modern patisserie meets grandma's recipe box": clean, airy layouts with soft, feminine, traditional details. Use your full creativity, but with restraint: cute, never cluttered.

**Brand:** the app is **FoodwishUs** (food + wish + us: I wish it, U cook it), slogan **U cook. I eat.** The humor is a cheeky, loving wink: she is the star chef, he is her biggest (and hungriest) fan. Let that wink show up in microcopy. The logo is a heart-eyed, drooling fork in a gingham bib; reuse him as a mascot in empty states, loading screens and celebrations. Use our logo from `brand/` as-is for the app icon, splash screen and header, and generate all PWA icon sizes from it. The slogan appears on the splash screen, onboarding and the Today header.

**Mood:** modern minimalism, coquette bows and ribbons, cottage kitchen, vintage recipe cards, French bakery, cozy Swiss chalet.

**Palette** (design tokens as CSS variables; tune as needed):

| Token | Light | Use |
| --- | --- | --- |
| cream | #FFF8F0 | App background |
| blush | #F6D5DC | Cards and surfaces |
| rose | #D98C9A | Primary actions |
| cherry | #C8414B | Hearts and small accents, sparingly |
| sage | #B5C4A8 | Secondary and success |
| butter | #F5E3A3 | Highlights |
| cocoa | #4A3833 | Text |

Dark mode is "candlelight": deep plum-cocoa background (around #2A1F24), warm cream text, rose accents that glow softly.

**Typography:** a characterful display serif for headings (Fraunces or Playfair Display), a friendly rounded sans for UI (Nunito or DM Sans), and a script (Parisienne or Pinyon Script) only for quotes and tiny flourishes, never for UI text. Self-host the fonts so they work offline.

**Deco kit:** custom inline SVGs in one consistent hand-drawn line style: bows, hearts, cherries, whisk, rolling pin, teacup, cloche, herb sprigs, tiny florals, lace and scalloped edges, embroidery-stitch dashed borders, washi tape, wax seal. A very subtle gingham pattern (6% opacity or less) on some backgrounds. Everything original: no copyrighted characters or brand art.

**Components:** cards with scalloped or 20 px rounded corners, soft pink-tinted shadows (not grey), pill buttons, bottom tab bar with a raised center "+" shaped like a cloche or heart. Hearts for craving, little spoons or stars for review criteria.

**Layout and accessibility:** mobile-first for 360 to 430 px widths (Android phones), safe areas respected, actions within thumb reach, touch targets at least 44 px, generous white space. Centered with a max width on tablet and desktop. All text meets WCAG AA contrast. At most one deco accent per screen area.

**Styleguide first:** build a `/styleguide` route showing tokens, type scale, components and the deco kit. Screenshot it, critique it, refine it before building features.

## 8. Quotes, microcopy and animations

The personality lives in copy and motion: every key moment gets a tiny reward.

**Quotes:** write at least 40 original quotes, each under 12 words, about food, cooking and love. Rotate them on Today, empty states, loading screens and after reviews. Original text or traditional proverbs only: no song lyrics, no lines from books or films. Set the tone with these, then write more in the same voice:

- Love, served warm.
- Made with butter, patience and a little chaos.
- Every plate is a tiny love letter.
- A clean plate is the sweetest compliment.
- Stir slowly, love loudly.
- Kitchen's open, heart's open.
- Today's special: us.
- Butter makes it better. So do you.
- Proof or it didn't happen.
- No photo, no dessert.
- Grandma would be proud.
- En Guete, Schätzli! (Swiss German mealtime greeting, if German is chosen)

**Craving scale (hearts):**

| Score | Label |
| --- | --- |
| 1 | Only if I'm starving |
| 2 | Hmm, maybe |
| 3 | Sure, why not |
| 4 | Ooh, yes please |
| 5 | Feed me this immediately |

**Review scale:** 1 Let's never speak of it, 2 Not my favorite, 3 Solid, 4 So good, 5 Chef's kiss.

**Emoji reactions** (big tappable buttons, social-media style; stored as a 1 to 6 score; labels editable in Settings):

| Score | Emoji | Label |
| --- | --- | --- |
| 1 | 😵 | Kitchen disaster |
| 2 | 😬 | Not my thing |
| 3 | 😐 | Meh |
| 4 | 🙂 | Pretty good |
| 5 | 😋 | Yummy |
| 6 | 🤤 | Super delicious |

Long-press opens extra one-off reactions (multi-select): ❤️ Love it, 🔥 Fire, 👑 Chef queen, 🧂 Needs salt, 🌶️ Too spicy, 🔁 Again please. The Chef reacts back to a review the same way. Use the phone's native emoji (Noto Color Emoji on Android), or Google's animated Noto emoji if their license fits, with credit.

**Empty states:** a small illustration, a quote and one clear action, for example "The wishlist is empty. Time to dream up something delicious."

**Animations** (spring-based, 150 to 400 ms, always honoring prefers-reduced-motion):

- Heart burst when a craving score is set. Emoji reaction buttons pop, wiggle and float a mini copy upward when tapped.
- Cards lift and tilt slightly while dragged, then settle with a soft spring.
- The proof polaroid develops from white to photo with a slight tilt.
- The wax seal stamps down with a small squash and settle on review submit.
- Heart and sprinkle confetti on a 5/5.
- Steam curls rising from a cloche as the loading indicator.
- Screen transitions that feel like flipping a recipe card.
- Charts grow in on first view.
- Small idle delights, such as the bow on the tab bar wiggling on tap.

**Haptics:** use the Vibration API (works in Chrome on Android) for drags, reactions and the wax seal. **Sound:** off by default, with an optional soft chime when a meal is served.

## 9. Tech stack, data model and quality bar

Default to a TypeScript PWA; change any part only with a reason in `DECISIONS.md`.

**Stack:** Vite, React, TypeScript, Tailwind CSS on the design tokens, Motion for animation, dnd-kit for drag and drop, one chart library that handles heatmaps, radar and scatter (for example ECharts, or Recharts plus custom SVG), date-fns with Europe/Zurich, vite-plugin-pwa (Workbox; offline, installable, maskable icons), Dexie for the IndexedDB cache and outbox, supabase-js (database, auth, storage, realtime), the Supabase CLI for migrations and row-level security, one Supabase Edge Function using Web Push with VAPID keys, an i18n library, Vitest with Testing Library, and Playwright with Android device emulation.

**Data model** (adapt to the sync layer, keep the concepts):

```ts
// Every table also has householdId (row-level security) and updatedAt (sync).
type Member = { id: string; name: string; avatar: string; color: string }

type Ingredient = { quantity?: number; unit?: string; name: string }
type Step = { text: string; timerSeconds?: number; photoId?: string }

type Dish = {
  id: string; name: string; description?: string
  course: 'starter' | 'main' | 'side' | 'dessert' | 'breakfast' | 'snack' | 'drink'
  tags: string[]; effort?: 'easy' | 'medium' | 'fancy'
  recipe: {
    servings: number; prepMinutes?: number; cookMinutes?: number
    ingredients: Ingredient[]; steps: Step[]; notes?: string; sourceUrl?: string
  }
  nutrition: { kcalPerServing?: number; proteinG?: number; carbsG?: number; fatG?: number; isEstimate?: boolean }
  coverPhotoId?: string; icon?: string
  createdBy: string; createdAt: string; archived?: boolean
}

type Menu = { id: string; name: string; courses: { dishId: string; order: number }[]; createdBy: string; createdAt: string }

type Serving = {
  id: string; dishId?: string; menuId?: string
  proposedBy: string; proposedAt: string; note?: string; suggestedDays?: string[]
  craving?: 1 | 2 | 3 | 4 | 5
  priority: string // fractional index
  status: 'wishlist' | 'planned' | 'served' | 'eaten' | 'skipped'
  plannedFor?: { date: string; slot: 'breakfast' | 'lunch' | 'dinner' | 'dessert' }
  servedAt?: string; eatenAt?: string; skippedReason?: string
  proofPhotos: { photoId: string; source: 'camera' | 'gallery'; takenAt: string; courseDishId?: string }[]
}

type Review = {
  id: string; servingId: string; dishId: string; reviewerId: string
  reaction: 1 | 2 | 3 | 4 | 5 | 6 // Kitchen disaster ... Super delicious
  extraReactions: string[] // 'love', 'fire', 'chef-queen', 'needs-salt', 'too-spicy', 'again'
  overall: 1 | 2 | 3 | 4 | 5
  scores: Record<string, 1 | 2 | 3 | 4 | 5> // criterionId -> score
  portionsEaten: number // 0.5, 1, 1.5, 2 ...
  wouldEatAgain: boolean; comment?: string; chips: string[]
  chefSelfRating?: 1 | 2 | 3 | 4 | 5
  chefReaction?: 1 | 2 | 3 | 4 | 5 | 6; chefReply?: string
  createdAt: string; sealedAt: string // createdAt + 24 h
}

type Criterion = { id: string; label: string; icon: string; active: boolean; order: number }

type PushSubscriptionRow = { memberId: string; endpoint: string; keys: { p256dh: string; auth: string }; mutedTypes: string[] }
```

**Quality bar:**

- Lighthouse on mobile: installable PWA, Performance 90+, Accessibility 95+.
- Works offline after first load, including already-synced photos.
- Unit tests for every stat definition in section 5, plus tests proving row-level security blocks anyone outside our household.
- Playwright end-to-end with two browser contexts (Chef and Taster): pair, propose, crave and reorder, plan, serve, photo (fixture image), review, stats update on both sides, with one context offline mid-flow.
- Playwright screenshots of every screen at 412 x 915 (a typical Android phone), light and dark. Review them yourself and fix what looks off.
- No analytics, ads, trackers or third-party calls beyond the sync service.
- A demo-data seed (about 30 dishes, 3 months of servings) behind a toggle, so the Cockpit can be judged. One tap removes it.

## 10. Build plan, workstreams and definition of done

Build in eight milestones and commit at the end of each. Stop for our feedback only twice: after the styleguide (M2) and at the very end.

1. **M0 Plan:** Phase 0 questions, then `PLAN.md` and `DECISIONS.md`.
2. **M1 Sync spike:** Supabase project, schema, row-level security, local cache and outbox; prove offline edits, photo sync, pairing and one push notification in two Android-sized browser contexts. This gate must pass before any feature work.
3. **M2 Design system:** tokens, fonts, components, deco SVG kit, `/styleguide`. Show us screenshots in light and dark mode and wait for feedback.
4. **M3 Core:** pairing, dishes with full recipes and calories, cook mode, menus, Wishlist with craving and drag order, planning, Our Week.
5. **M4 Serve and review:** served state, push notifications, proof photo, emoji reactions, review sheet, wax seal, photo wall.
6. **M5 Cockpit:** stats module with unit tests, filters, charts (including calories, eating times and reactions), drill-down, Hall of Fame.
7. **M6 Polish:** animations, quotes, empty states, dark mode, i18n, accessibility, offline.
8. **M7 Ship:** end-to-end tests, Lighthouse, deployment, README.

**Parallel workstreams after M2** (sub-agents, each owning its folder; define shared types in `src/data/types.ts` and tokens in `src/ui/tokens` first):

| Workstream | Owns |
| --- | --- |
| A. Sync and data layer: Supabase schema, row-level security, local cache and outbox, pairing, push function, keep-alive, export/import | `src/data`, `supabase/` |
| B. Planning screens: Today, Wishlist, Our Week, dishes, recipes, cook mode and menus | `src/features/planning` |
| C. Serve, proof photo, emoji reactions, review, photo wall | `src/features/review` |
| D. Cockpit and stats library with unit tests | `src/features/cockpit`, `src/lib/stats` |
| E. Deco SVGs, illustrations, quotes, animation primitives | `src/ui/deco`, `src/content` |

No agent edits another's folder without coordinating. One integration pass runs the full end-to-end suite after each merge.

**Definition of done:**

- [ ] We can both install the app from a link and pair by QR code or invite link in under 2 minutes.
- [ ] The full lifecycle works across both phones, including while one phone is offline.
- [ ] Photos sync and display on both phones, and a push notification reaches the partner within a minute of "Served".
- [ ] Every Cockpit number matches section 5 and is unit-tested.
- [ ] Export, then import on a fresh install, restores everything including photos.
- [ ] Every screen looks polished in light and dark mode screenshots.
- [ ] `README.md` is written for non-developers: installing on Android (Chrome, menu, Install app), pairing, backups, and running costs (target: zero).
- [ ] `DECISIONS.md` explains the sync choice, its limits (storage quotas, free-tier caps, the 7-day pause and our keep-alive) and what we do if the service ever shuts down.

Start now with Phase 0, and surprise us.
