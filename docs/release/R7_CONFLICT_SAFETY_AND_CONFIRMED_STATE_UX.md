# R7 — Booking Conflict Safety & Confirmed-State UX

**Status:** Stale-availability / competing HOLD coverage added (integration + opt-in Playwright); confirmed inquiry and booking detail UX simplified.  
**Not a production-readiness approval. Do not deploy from this document alone.**  
**STOP after R7.**

---

## 1. Database isolation evidence

| Path | Database | Isolation |
|---|---|---|
| Integration conflict tests | Neon **TEST** `ep-sparkling-bird-…` via `.env.test` (`MAGICCRM_DATABASE_ROLE=test`) | Disposable orgs per test; cleaned in `afterEach` |
| Playwright conflict e2e | Neon **DEV** `ep-bold-art-avjy5nt4` + Clerk **TEST** keys | Exclusive `R7 Exclusive Suite` (1 unit) + attraction; does **not** use shared R5 bowling inventory; leftover HOLDs on that type released at fixture create |
| Fixtures | `playwright/.fixtures/r7-conflict.json` (gitignored) | Unique far-future event dates; synthetic PII |

No transactional availability checks were weakened.

---

## 2. Concurrency / stale availability assertions

### Integration (`tests/integration/r7-stale-availability-conflict.test.ts`)

| Scenario | Asserted |
|---|---|
| Both inquiries check availability successfully on exclusive unit | `available === true` for both |
| First places HOLD | Active HOLD count = 1 |
| Second HOLD fails | `ResourceError`; second has 0 reservations, 0 bookings, not `BOOKED` |
| Second recheck | `available === false` |
| Concurrent HOLD race | Exactly one fulfilled HOLD; one rejection; total active HOLDs = 1; 0 bookings |

### Playwright opt-in (`@staff-conflict`, `PLAYWRIGHT_STAFF_MUTATIONS=1`)

| Step | Result |
|---|---|
| Both inquiries Start Working + Check Availability | Soft refresh |
| Winner Place HOLD | Active HOLD state without requiring hard reload |
| Loser Place HOLD blocked or fails | No Active HOLD / no Open Booking on loser; conflict / unavailable guidance; Check Availability path when available |

Commands:

```bash
corepack pnpm test:e2e:staff:r7-fixture
export PLAYWRIGHT_STORAGE_STATE="$PWD/playwright/.auth/staff.json"
export PLAYWRIGHT_STAFF_MUTATIONS=1
corepack pnpm test:e2e:staff:r7-conflict
```

---

## 3. Confirmed inquiry UX (before → after)

| Aspect | Before | After |
|---|---|---|
| Heading / status | Generic assigned copy; coach “This event is booked” | **Booked** badge + booking number; coach title **Booked** |
| Primary action | Mixed with cancel / historic links | **Open Booking** (`data-primary-booking-action`) |
| Secondary | Inline Master Schedule link | **View on Schedule** |
| Event summary | Sparse “Booking confirmed” card | Confirmed date, time, guests, activities, total; payment-neutral note |
| HOLD / confirmation readiness | Full active workflow panels | Collapsed **Historical readiness details** (`canHold={false}`) |
| Plan history | Full plan snapshot always open | Collapsed **Original customer selection & plan history** |
| Cancel | Present with confirm dialog | Remains permission-gated + confirm dialog; not primary |

---

## 4. State distinctions

| State | Heading / badge | Primary action |
|---|---|---|
| Unassigned | Unassigned | Start Working |
| Claimed / in progress | In progress | Check Availability → Confirm / HOLD cues |
| Active HOLD | Active HOLD | Confirm booking (HOLD ≠ booking) |
| Confirmed | Booked | Open Booking |
| Cancelled | Cancelled | Open historical booking / View on Schedule |

HOLD copy explicitly states proposal HOLD is not a confirmed booking. Payment is never implied.

---

## 5. Booking detail layout

- Wider content (`max-w-6xl`) with compact summary header (status badge, date/time/guests/total)
- Desktop two-column: event plan + notes | pricing + resources
- Mobile single column; cancel remains behind confirm dialog
- View on Schedule + Open inquiry secondary actions; no sticky action overlap

---

## 6. Screenshots

Capture: `pnpm test:e2e:staff:r7-evidence` → `docs/release/r7-evidence/`

Viewports: **390 / 768 / 1024 / 1440** for:

- Unassigned / working inquiry
- Active HOLD inquiry (when fixture state allows)
- Confirmed inquiry
- Confirmed booking detail
- Master Schedule

Manifest: `docs/release/r7-evidence/manifest.json`.

---

## 7. Exact validation results

| Suite | Result | Counts |
|---|---|---|
| Lint | **Pass** | 0 errors; 1 pre-existing unused-import warning (`catalog-resource-allocation.test.ts`) |
| Typecheck | **Pass** | — |
| Unit | **Pass** | **117** files / **614** tests |
| Production build | **Pass** | Next.js 16.3.3 compile OK |
| Integration R7 conflict (Neon TEST) | **Pass** | **1** file / **2** tests |
| Staff observation Playwright (fresh staff fixture; exclude lifecycle/a11y/conflict) | **Pass** | **23 passed** |
| Staff axe | **Pass** | **2 passed** |
| Lifecycle mutations (`PLAYWRIGHT_STAFF_MUTATIONS=1`) | **Pass** | **6 passed**, **1 skipped** (legacy conflict-after-availability placeholder) |
| Conflict Playwright (`@staff-conflict`) | **Pass** | **1 passed** |
| R7 evidence capture | **Pass** | Shell/inquiry/hold/confirmed/booking-detail/schedule at 390–1440 (`docs/release/r7-evidence/`) |

Note: After `r5-fixture` + lifecycle mutations, regenerate `pnpm test:e2e:staff:fixture` before observation suites — lifecycle overwrites `staff-inquiry.json` with a mutated HOLD path, and confirmed/cancelled inquiries collapse readiness into `<details>` (hidden to Playwright visibility checks).

---

## 8. Remaining limitations

| Item | Notes |
|---|---|
| Production deploy | Out of scope — STOP after R7 |
| Soft refresh lag after HOLD under awareness polling | E2e waits on Active HOLD state (up to 60s); product still awaits `router.refresh()` |
| Simultaneous UI double-click confirm across two browsers | Covered at service layer (integration race); not dual-browser Playwright |
| Payment | Intentionally not integrated |

---

## 9. Production readiness assessment

| Recommendation | Detail |
|---|---|
| Conflict safety (TEST/DEV) | **Verified** for exclusive-unit stale HOLD + concurrent HOLD race |
| Confirmed-state UX | **Improved** for staff post-confirm navigation |
| Production | **Do not deploy** based on R7 alone |

**STOP after R7. Do not deploy to production.**
