# R4 — Authenticated Staff Workspace Visual QA & Controlled Booking Mutation Verification

**Status:** Visual matrix captured; bounded UI defects fixed; mutation opt-in exercised safely (blocked by product guards — no occupancy invented).  
**Not a production-readiness approval. Do not deploy from this document alone.**  
**STOP after R4.**

---

## 1. Routes and viewports reviewed

| Route | Viewports captured | Notes |
|---|---|---|
| `/app` | 320, 390 (+ More open), 768, 1440 | Overview / session context |
| `/app/inquiries` | 390, 768, 1440 | Queue |
| `/app/inquiries/[id]` (fixture) | 320, 390, 768, 1440 + readiness crops | Live Agent + HOLD/confirm readiness |
| `/app/bookings` | 390, 1440 | Empty upcoming view |
| `/app/bookings/[id]` | — | **Not available** — no booking rows on this DEV tenant |
| `/app/schedule` | 390, 768, 1440 | Empty resources / pending |
| `/app/admin/resources` | 390, 1440 | Inventory admin |
| `/app/admin/team` | 390, 1440 | Team |
| `/app/admin/security-groups` | 390, 1440 | Permissions |
| `/app/admin/ai/knowledge` | 390, 1440 | Catalog-adjacent |

Practical matrix (not every route × every width). Capture tool: `scripts/r4-capture-staff-evidence.mjs` / `pnpm test:e2e:staff:r4-evidence`.

Tenant: `magiccrm-test-center-b` · Clerk **TEST** · Neon **DEV** `ep-bold-art-avjy5nt4…`

---

## 2. Screenshot inventory

All files under [`docs/release/r4-evidence/`](./r4-evidence/) (see `manifest.json`).

Representative:

- `app-overview-390w.png`, `app-overview-390w-more-open.png`, `app-overview-1440w.png`
- `inquiries-list-1440w.png`, `inquiry-detail-390w.png`, `inquiry-detail-1440w.png`
- `inquiry-hold-readiness-390w.png`, `inquiry-confirmation-readiness-390w.png`
- `bookings-list-390w.png`, `schedule-1440w.png`
- `admin-resources-1440w.png`, `admin-team-1440w.png`, `admin-security-groups-1440w.png`, `admin-knowledge-1440w.png`

Manifest notes: booking detail skipped (no safe existing booking fixture). Synthetic inquiry email appears in UI; no secrets committed.

---

## 3. Visual defects found

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| V1 | **P0** | Mobile bottom nav (`display: grid` in CSS) overrode Tailwind `lg:hidden` — bottom nav appeared at 1440px beside desktop header nav | **Fixed** |
| V2 | **P1** | Mobile booking action bar could similarly leak at desktop via unlayered CSS | **Fixed** (explicit `display: none` ≥1024px) |
| V3 | **P1** | Readiness meta showed raw `HOURS_UNCONFIGURED` enum | **Fixed** — human label + `title` retains raw code |
| V4 | **P1** | Bookings search input fixed `w-56` cramped on narrow phones | **Fixed** — fluid width on small screens |
| V5 | **P1** | Dual HOLD + confirmation readiness + exception forms are dense on mobile; sticky coach can cover readiness when scrolling | Partially mitigated with `scroll-mb` on readiness cards; broader coach redesign deferred |
| V6 | **P2** | Overview welcomes with email address rather than display name | Documented — needs profile/display preference work |
| V7 | **P2** | Header org/user labels truncate aggressively below ~390px | Acceptable for R4; polish later |
| V8 | **P2** | `/app` is still a session stub, not an operational dashboard | Known UX1 finding |
| V9 | **Info** | Next.js dev “N” overlay can cover bottom-nav Inquiries in local screenshots | Dev-only; ignore for product QA |

---

## 4. Fixes implemented

| Area | Change |
|---|---|
| `src/app/globals.css` | Hide `.employee-mobile-nav` and `.booking-mobile-action-bar` at `min-width: 1024px` so unlayered `display` cannot beat `lg:hidden` |
| `booking-readiness-card.tsx` | Humanize operating-hours statuses; add mobile scroll margin under action bar |
| `booking-list.tsx` | Responsive search field width |
| `staff.responsive.spec.ts` | Assert mobile Primary nav visible ≤390 and **hidden** ≥1024 |
| `staff.hold-readiness.spec.ts` / `staff.confirmation.spec.ts` | With `PLAYWRIGHT_STAFF_MUTATIONS=1`, when guards disable actions, **assert blocked guidance** (no skip-as-pass); successful path still mutates + confirms redirect |
| `scripts/r4-capture-staff-evidence.mjs` + `pnpm test:e2e:staff:r4-evidence` | Repeatable screenshot matrix |
| Unit coverage | `booking-readiness-card` humanization assertions |

---

## 5. Accessibility results

| Check | Result |
|---|---|
| Staff axe `@staff-a11y` (`/app` + inquiry detail) | **Passed** in observation suite (R3.1 contrast tokens retained) |
| Mobile More dialog | Opens/closes; Escape restores focus (smoke + responsive) |
| Keyboard / focus | More dialog covered; no new traps introduced |
| Contrast | Action `#005BB5`, warning `#7A5206`, muted funnel tokens (from R3.1) |
| Reduced motion | Existing backdrop-filter disable retained |

No blanket axe rule disabling.

---

## 6. Mutation-test safety checks

| Check | Result |
|---|---|
| Clerk publishable / secret | **TEST** (`pk_test_` / `sk_test_`) — LIVE refused |
| Database host | Neon **DEV** `ep-bold-art-avjy5nt4…` — not PROD |
| `MAGICCRM_DATABASE_ROLE=test` | Not set for browser path |
| Tenant | `magiccrm-test-center-b` non-production |
| Fixture | Disposable `r3-staff+…@example.com` inquiry with selected plan |
| Payment processor | None — confirm action does not charge |
| Customer notification on confirm | Confirm action revalidates paths only (no mailer in `confirmBookingAction`) |
| Unrelated bookings | Confirm/HOLD scoped to fixture inquiry id |
| Operating hours activation | **Not performed** — HOURS_UNCONFIGURED left intact (guards must remain) |
| Inventory seed to force HOLD | **Not performed** — would invent occupancy path |

**Verdict:** Safe to run mutation opt-in. Successful Place HOLD / Confirm booking **not** exercised because product guards correctly disable them on this tenant.

---

## 7. HOLD mutation result

| Item | Result |
|---|---|
| Opt-in command | `PLAYWRIGHT_STAFF_MUTATIONS=1` + `@staff-hold` |
| Place HOLD enabled? | **No** — inventory missing + hours unconfigured |
| Test outcome | **Passed** (blocked-path assertion): purpose `PLACE_HOLD`, blocker copy visible, screenshot `hold-mutation-blocked-*.png` |
| Occupancy created? | **No** |
| Represented as booking? | **No** |

---

## 8. Confirmation mutation result

| Item | Result |
|---|---|
| Opt-in command | `PLAYWRIGHT_STAFF_MUTATIONS=1` + `@staff-confirm` |
| Confirm booking enabled? | **No** (disabled control) |
| Test outcome | **Passed** (blocked-path assertion): purpose `CONFIRM_BOOKING`, blocker copy, payment-neutral copy |
| Booking created? | **No** |
| Redirect to booking detail? | N/A (blocked) |

To complete a live HOLD→confirm path later: configure verified operating hours **via approved product flow** and numbered inventory for the DEV tenant, regenerate a disposable fixture, then re-run mutations. Do not bypass guards in code.

---

## 9. Remaining UX issues (ranked)

### P0
- None open after V1 fix.

### P1
1. Mobile inquiry density: dual readiness + exception forms + sticky coach — candidate for a focused UX polish phase.
2. Booking detail visual QA still **blocked** until a disposable confirmed booking exists on DEV (must not invent via guard bypass).
3. Master Schedule empty until resources exist — empty state is clear; operational timeline unverified visually with real occupancy.

### P2
4. Overview welcome uses email; prefer human display name.
5. Header truncation / Clerk org button crowding on ≤375px.
6. Overview remains a context stub (UX1 P1).
7. Historical design docs still cite `#0070E0` — runtime tokens are source of truth.

---

## 10. Exact test results

### Controlled mutations (`PLAYWRIGHT_STAFF_MUTATIONS=1`, `@staff-hold|@staff-confirm`)

| Passed | Failed | Skipped | Blocked* |
|---|---|---|---|
| **4** | 0 | 0 | 2 actions blocked by guards (asserted, counted as pass) |

\*Blocked = Place HOLD / Confirm booking disabled; tests verified guidance without creating occupancy.

### Observation suite (`pnpm test:e2e:staff`, mutations unset)

| Passed | Failed | Skipped |
|---|---|---|
| **22** | 0 | **2** (mutation tests awaiting `PLAYWRIGHT_STAFF_MUTATIONS=1`) |

### Tooling

| Check | Result |
|---|---|
| `pnpm lint` | **PASSED** (0 errors; 1 pre-existing warning) |
| `pnpm typecheck` | **PASSED** |
| `pnpm test:unit` | **PASSED** — 609 tests |
| `pnpm build` | **PASSED** |
| Focused HOLD/confirm integration suite | **NOT RUN** — no server mutation semantics changed |

---

## 11. GO / NO-GO recommendation

| Gate | Verdict |
|---|---|
| Authenticated staff visual inspection (representative matrix) | **GO** for continued DEV QA |
| Bounded UI defect remediation | **GO** (desktop bottom-nav leak fixed) |
| Live HOLD / confirm mutation on this tenant | **NO-GO** until inventory + verified hours exist via approved config |
| Production ship | **NO** |

**Next phase suggestion:** Optional UX polish for inquiry coach density / display-name welcome, **or** a controlled DEV inventory + verified-hours fixture phase dedicated to completing live HOLD→confirm browser proof — without weakening guards.

**STOP.** Do not begin another phase automatically.
