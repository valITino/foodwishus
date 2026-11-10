# Plan

Eight milestones. Feedback stops after M2 (design) and at the end.

- [x] **M0 Plan.** Setup questions answered: Android, English with a German switch, public repo on GitHub Pages.
- [x] **M1 Sync foundation.** Supabase schema and security rules, local database, outbox, sync engine,
      photo queue, pairing rules. Proven with unit tests and a two-phone end-to-end test.
- [x] **M2 Design system.** Tokens for light and candlelight, fonts, components, deco kit, Fork the
      mascot, `/#/styleguide`. **Waiting for your feedback before screens are built.**
- [x] **M3 Core.** A step-by-step start (open or join by QR code or link, role, avatar, status, PIN),
      PIN log-in from any device, an admin with a People page, profiles (avatar maker and a
      status line the partner sees, like "Always Huuungryyyyy"), settings that follow the person,
      dishes with full recipes and calories, cook mode, menus, Wishlist with craving and drag
      order, planning, Our Week, a demo kitchen with three months of sample menus.
- [x] **M4 Serve and review.** Served state, proof photo (camera or gallery, as a developing
      polaroid), emoji reactions with extras, review sheet, one verdict per course for menus,
      wax seal, the Chef's guess and answer, photo wall. *Push notifications move to M6: they
      need the service worker that is built there.*
- [x] **M5 Cockpit.** Stats library with unit tests, filter bar, eleven tiles, sixteen charts
      (ratings, criteria, craving against reality, calendar of hearts, calories, eating times,
      reactions, recipes), dish in numbers, Hall of Fame, fun facts.
- [x] **M6 Polish.** Service worker (the app opens offline, a "new version" note with Reload),
      an install card, push notifications with a switch per kind, an accessibility pass over
      every screen with a guard test. *Push is switched on in the live Supabase project
      (10 Nov 2026); a real notification on a real phone is still to be seen.*
- [x] **M7 Ship.** Backup (export and import), review criteria in Settings, the Sync page
      with refused changes, Lighthouse measured, final README. *Open:* Lighthouse performance
      is around 80, the goal is 90 (the first load carries everything in one piece of JavaScript).

## What is verified so far, and how

| Area | Verified by |
| --- | --- |
| Database rules (strangers locked out, two seats, PIN log-in and its lock, admin-only powers, pause, restore, master key, sealed reviews) | `supabase/tests/security_test.sql`, run against the real project on 10 Nov 2026: 55 checks pass |
| The app calls only database functions that exist, with the right parameter names | `tests/unit/supabaseContract.test.ts` reads the signatures out of `supabase/migrations` |
| Sync, log-in, admin, proof and review logic, every Cockpit number, the backup file and its merge rules, review criteria, refused changes | 486 unit tests against a pretend cloud that follows the same rules |
| Every user flow so far: the start, joining, logging in on a second device, the admin's tools, the Recipe Book, cook mode, the Wishlist, planning, Our Week, proof photo and review, the Chef's answer, the photo wall, the Cockpit with its filters, the back button closing sheets, two devices syncing while one is offline, a backup exported and imported into an empty kitchen and into a kitchen with a partner, review criteria, the Sync page with refused changes | 95 tests in real browsers at Android size (`tests/e2e`) |
| Accessibility basics on every screen: every control has a name, nothing scrolls sideways at 360 px, one h1, focus goes into a sheet and back | `tests/e2e/a11y.spec.ts`, in English and German; plus an audit with axe-core in light and candlelight |
| Lighthouse (mobile) on the production build, start screen and Today | Accessibility 100, best practices 100, performance around 80 (several runs) |
| Design in light and candlelight, English and German | Screenshots at 412 and 360 wide, looked at one by one |

## Not verified yet

- **The app talking to the real Supabase project.** The workspace this was built in cannot reach
  Supabase. The database side is tested for real (see above) and the app is tested against a
  stand-in that follows the same rules, but the two have never met. Their first meeting is on
  your phones, when you open the kitchen. If something is off, Settings has "Copy details"
  under Sync: send me that text.
- **A real Android phone.** The number pad for the PIN, long-press dragging, vibration and
  installing to the home screen were only tried in an Android-sized desktop browser.
- **The camera** was tried only by handing the app a picture file. Opening the real camera from
  the button, and photos travelling between two phones through the real cloud, need your phones.
- **Push notifications reaching a real phone.** The server side is live: the function runs on
  Supabase, refuses calls without the secret and made its keys. The triggers and the words
  are tested on a local Postgres and under Node. What nobody has seen yet is a notification
  arriving on a phone: that needs the app from this milestone on both phones and
  "Turn on notifications" tapped.
- **The first real contact with Supabase happened on 10 Nov 2026:** opening the kitchen,
  joining by link and syncing between the two phones worked.
