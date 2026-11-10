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
- [ ] **M4 Serve and review.** Served state, push notifications, proof photo, emoji reactions,
      review sheet, wax seal, photo wall. *The data side is done and tested; the screens are next.*
- [ ] **M5 Cockpit.** Stats library with unit tests, filters, charts (ratings, calories, eating
      times, reactions), drill-down, Hall of Fame. *The stats library is done and tested; the screens are next.*
- [ ] **M6 Polish.** Service worker (offline app shell, install prompt), remaining animations,
      40+ quotes, empty states, full German copy, accessibility pass.
- [ ] **M7 Ship.** Export and import, sync diagnostics screen, Lighthouse, full end-to-end suite, final README.

## What is verified so far, and how

| Area | Verified by |
| --- | --- |
| Database rules (strangers locked out, two seats, PIN log-in and its lock, admin-only powers, pause, restore, master key, sealed reviews) | `supabase/tests/security_test.sql`, run against the real project on 10 Nov 2026: 55 checks pass |
| The app calls only database functions that exist, with the right parameter names | `tests/unit/supabaseContract.test.ts` reads the signatures out of `supabase/migrations` |
| Sync, log-in, admin, proof and review logic, and every Cockpit number | 301 unit tests against a pretend cloud that follows the same rules |
| Every user flow so far: the start, joining, logging in on a second device, the admin's tools, the Recipe Book, cook mode, the Wishlist, planning, Our Week, and two devices syncing while one is offline | 39 tests in real browsers at Android size (`tests/e2e`) |
| Design in light and candlelight, English and German | Screenshots at 412 and 360 wide, looked at one by one |

## Not verified yet

- **The app talking to the real Supabase project.** The workspace this was built in cannot reach
  Supabase. The database side is tested for real (see above) and the app is tested against a
  stand-in that follows the same rules, but the two have never met. Their first meeting is on
  your phones, when you open the kitchen. If something is off, Settings has "Copy details"
  under Sync: send me that text.
- **A real Android phone.** The number pad for the PIN, long-press dragging, vibration and
  installing to the home screen were only tried in an Android-sized desktop browser.
- **Push notifications and the camera** need real phones too (M4).
