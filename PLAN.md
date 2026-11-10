# Plan

Eight milestones. Feedback stops after M2 (design) and at the end.

- [x] **M0 Plan.** Setup questions answered: Android, English with a German switch, public repo on GitHub Pages.
- [x] **M1 Sync foundation.** Supabase schema and security rules, local database, outbox, sync engine,
      photo queue, pairing rules. Proven with unit tests and a two-phone end-to-end test.
- [x] **M2 Design system.** Tokens for light and candlelight, fonts, components, deco kit, Fork the
      mascot, `/#/styleguide`. **Waiting for your feedback before screens are built.**
- [ ] **M3 Core.** A step-by-step start (open or join by QR code or link, role, avatar, status, PIN),
      PIN log-in from any device, an admin with a People page, profiles (avatar maker
      and a status line the partner sees, like "Always Huuungryyyyy"), dishes with full
      recipes and calories, cook mode, menus, Wishlist with craving and drag order, planning, Our Week.
- [ ] **M4 Serve and review.** Served state, push notifications, proof photo, emoji reactions,
      review sheet, wax seal, photo wall.
- [ ] **M5 Cockpit.** Stats library with unit tests, filters, charts (ratings, calories, eating
      times, reactions), drill-down, Hall of Fame.
- [ ] **M6 Polish.** Service worker (offline app shell, install prompt), remaining animations,
      40+ quotes, empty states, full German copy, accessibility pass.
- [ ] **M7 Ship.** Export and import, sync diagnostics screen, Lighthouse, full end-to-end suite, final README.

## What is verified so far, and how

| Area | Verified by |
| --- | --- |
| Database rules (strangers locked out, two seats, PIN log-in and its lock, admin-only powers, pause, restore, master key, sealed reviews) | `supabase/tests/security_test.sql`, run against the real project on 10 Nov 2026: 55 checks pass |
| The app calls only database functions that exist, with the right parameter names | `tests/unit/supabaseContract.test.ts` reads the signatures out of `supabase/migrations` |
| Sync logic (offline queue, per-field merge, photos, lock-out, refused changes) | 19 unit tests against a pretend cloud that follows the same rules |
| Two phones in real browsers, one offline, never online together | `tests/e2e/sync.spec.ts` (Android viewport) |
| Design in light and candlelight | Screenshots at 412 x 915 from the production build |

## Not verified yet

- **The app talking to the real Supabase project.** The workspace this was built in cannot reach
  Supabase, so the thin adapter (`src/data/supabaseBackend.ts`) has only been tested for its
  offline behaviour. Its first real test is on your phones in M3.
- **Push notifications and the camera** need real phones too (M4).
