# Phase 12O — Employee copy clarity + E2E coverage

**Date:** 2026-11-22  
**Branch:** `phase-12o-employee-copy-clarity-e2e`  
**Baseline:** `main` @ `e309b47` (PR #31 merged)  
**Nature:** Presentation-only copy + read-only authenticated E2E. **No** payment, booking, authorization, pricing, or `canDeliver` behavior changes.

---

## Executive summary

All four Phase 12N P2 findings (N01–N04) are resolved at the presentation layer. Booking-detail and schedule-block navigation are covered by a new `@phase-12o` Playwright suite on synthetic Test Center B. Quality gates passed; changes are safe to merge.

---

## PR #31 status

| Item | Result |
|---|---|
| PR #31 | **Merged** into `main` (`e309b47`) before 12O implementation |
| Content | Docs/evidence-only Phase 12N audit — findings preserved, not overwritten |

---

## P2 resolutions

### N01 — Pending “unpaid” language → **Resolved**

- **Before:** Pending panel described unpaid booking requests.  
- **After:** Heading **Pending confirmation**; body: “Booking requests awaiting staff confirmation. They do not occupy the schedule until confirmed.”  
- **Semantics verified:** `PENDING_PAYMENT` / pending list = awaiting staff confirmation; pending rows do not occupy schedule inventory. Deposit amounts may still display when `depositRequiredCents > 0` without claiming payment was collected.  
- **Evidence:** `after-schedule-pending-confirmation-1440.png` (`hasUnpaid: false`).

### N02 — Contact customer CTA → **Resolved**

- **Actual behavior:** `mailto:` opens the staff email client — MagicCRM does not send.  
- **After:** Label **Contact customer manually**; demoted to secondary outline when `canDeliver: false`; title clarifies mailto. Attention copy distinguishes manual outreach from quote delivery.  
- **No** new email-sending capability. Customer quote delivery remains disabled.

### N03 — Catalog discrepancy UX → **Resolved**

- Discrepancy block now separates **What differs** / **Why it matters** / **What to do next**.  
- Human labels via `employeeCatalogDiscrepancyLabel`.  
- Preserves WP vs catalog cent amounts; does **not** claim live WordPress pricing parity.  
- **Evidence:** `after-staff-quote-delivery-discrepancy-1440.png` (`hasWhatDiffers: true`).

### N04 — Duplicate delivery banners → **Resolved**

- Canonical banner on Staff quote (`data-wp-quote-delivery-banner`) uses `CUSTOMER_QUOTE_DELIVERY_UNAVAILABLE_MESSAGE`.  
- Inquiry Delivery status strip uses a short pointer (“See Staff quote…”) instead of repeating the full paragraph.  
- Stage 4 approve description reuses the same canonical message when delivery is blocked.  
- Observed `deliveryBannerCount: 1` on inquiry detail capture.  
- **`canDeliver: false` unchanged.**

---

## Screenshots

**Directory:** `docs/design/phase-12o-screenshots/`  
**Capture script:** `scripts/phase-12o-capture-screenshots.mjs`  
**JSON:** `planning/employee-ux/phase-12o/screenshot-evidence.json`

| Pair | Before (12N) | After (12O) |
|---|---|---|
| Schedule pending copy | `before-schedule-1440.png` | `after-schedule-pending-confirmation-1440.png` |
| Inquiry contact CTA | `before-inquiry-detail-1440.png` | `after-inquiry-contact-manual-1440.png` |
| Staff quote delivery + discrepancy | `before-staff-quote-1440.png` | `after-staff-quote-delivery-discrepancy-1440.png` |

Responsive after shots at 375 / 430 / 768 / 1024 / 1440 / 1920 for schedule + bookings: **no horizontal overflow**.

---

## Booking-detail E2E

File: `tests/e2e/employee-booking-schedule-nav.spec.ts` (`@phase-12o` / `@employee-bookings-nav`)

| Case | Result |
|---|---|
| Admin: open Bookings → synthetic row → detail → Back to bookings | **Pass** |
| Front Desk: detail readable; no Cancel / New Booking | **Pass** |
| No unintended writes | Read-only navigation only |

---

## Schedule-block navigation E2E

| Case | Result |
|---|---|
| Admin: confirmed booking → View on Schedule → click HOLD/Booked block → detail distinguishes HOLD vs Booked | **Pass** |
| Front Desk: schedule deep-link cannot open create dialog | **Pass** |
| Pending confirmation copy + no `\bunpaid\b` on schedule | **Pass** |
| HOLD mutations | **Not run** — remain opt-in `@staff` |

Wired into `employee-admin`, `employee-event-sales`, and `employee-front-desk` projects in `playwright.config.ts`.

---

## Skip classification (employee suite)

**This run:** **59 passed / 77 skipped / 0 failed** (136 tests scheduled across 3 role projects + setup).

| Class | Approx. count | Notes |
|---|---|---|
| Expected role exclusion | ~76–77 | Same test file matched by multiple role projects; each role skips non-owned cases |
| Missing fixture | 0 this run | WP / LA fixtures present when needed |
| Optional mutation (`@staff` HOLD/confirm) | Outside this suite | Intentionally opt-in; not counted as pass |
| Environment limitation | 0 this run | Schedule occupancy derived from synthetic bookings |
| Actual coverage gap | **Closed for booking detail + schedule block nav** | Remaining polish items are P3 from 12N (N05–N09), not skips |

Skipped tests are **not** counted as passed.

---

## Quality gates

| Gate | Result |
|---|---|
| Typecheck | **Pass** |
| Lint | **Pass** (0 errors; 4 pre-existing warnings in unrelated scripts) |
| Unit tests | **1016 passed / 1 skipped** (162 files) |
| Production build | **Pass** |
| Quote E2E | **7 passed / 0 failed** |
| Employee regression E2E | **59 passed / 77 skipped / 0 failed** |
| New booking/schedule nav E2E | Included above; targeted admin schedule-block re-run **9 passed / 2 skipped** |

---

## Safeguards preserved

- `approved_plugin_baseline` / `finalLivePriceRevalidation: pending` posture  
- `canDeliver: false`  
- 25% deposit display math unchanged  
- VERIFIED operating hours untouched  
- Role permissions unchanged  
- HOLD ≠ confirmation  
- Customer email delivery still blocked  
- Live WordPress plugin untouched  
- Scenario Lab untouched  
- No Production customer-data writes  

---

## Phase 12O PR / Production

| Item | Status |
|---|---|
| Phase 12O PR | Created from this branch (presentation + read-only tests) |
| Merge | Proceed when gates green (this report) |
| Vercel Production | Confirm Ready after merge |
| Production smoke | Read-only `/app` redirect / Clerk gate only |

---

## Remaining operational risks

1. **Customer quote delivery** remains intentionally unavailable until live pricing verification.  
2. **Front Desk inquiry access** remains denied by design (12E E05).  
3. **Catalog vs WP amounts** still differ on known lines — staff must treat WordPress draft amounts as source of money until live verification.  
4. **Clerk/org auth flakiness** under concurrent load can briefly 500 `/app` during setup (observed once; clean retry succeeded).  
5. P3 polish from 12N (approval timestamp formatting, dirty-leave warning, occupancy chip semantics) remains open — not blocking for 12O.
