# Phase 12L — Bookings & Master Schedule UX

**Date:** 2026-11-22  
**Branch:** `phase-12l-bookings-schedule-ux`  
**Scope:** Presentation UX for Bookings list/detail and Master Schedule, plus a small timezone RBAC continuity fix so Front Desk `calendar.view` / `events.view` can load schedule and booking detail. No HOLD, confirmation, pricing, payment, or permission-key changes.  
**Recommendation:** **Leave PR open for review** — mostly presentation, but timezone gate is not presentation-only.

---

## 1. Workflow findings (before)

| Area | Finding |
|---|---|
| Bookings list | Booking number dominated hierarchy; customer secondary; Preview totals read like payment due |
| New Booking | Always shown, including Front Desk (no `events.create`) |
| Booking detail | Weak next-action copy; resources showed “booked/released” without HOLD badge |
| Schedule deep-links | Live Agent/`View on Schedule` passed `type`/`start`; board only honored `date`/`focus` |
| HOLD vs Booked | Similar block density; occupancy chips said “have bookings today” for holds too |
| Empty schedule | EmptyState + empty mobile list doubled messaging |
| Horizontal scroll | 2px scrollbar easy to miss |
| Home Today | Empty copy said “schedule” while linking to bookings filter |
| Front Desk schedule | Nav showed Schedule, but page failed because timezone helper required `crm.inquiries.view` |

---

## 2. Prioritized usability issues addressed

1. **P0 — HOLD ≠ confirmed** — dashed HOLD chrome, legend, occupancy copy “(holds + booked)”, detail dialog “HOLD — temporary”
2. **P0 — Front Desk schedule/booking timezone gate** — `getCurrentTenantTimezone` accepts inquiries **or** events **or** calendar view
3. **P1 — Bookings hierarchy** — customer primary; booking # secondary; next-action lines; deposit/preview demoted
4. **P1 — Gate New Booking** — `events.create` only
5. **P1 — Deep-link presentation** — `type` → focus alias; `start` scrolls/highlights timeline slot
6. **P2 — Resources on detail** — HOLD / Booked / Released badges from existing reservation status
7. **P2 — Scroll cue + thicker schedule scrollbar**
8. **P2 — Home empty copy** — “No confirmed bookings for today.”

---

## 3. Before / after screenshots

After shots in `docs/design/phase-12l-screenshots/`:

- `after-bookings-1440.png` / `after-bookings-375.png`
- `after-booking-detail-1440.png`
- `after-schedule-1440.png` / `768` / `375` / `1920`
- `after-schedule-holds-1440.png`

Before-state documented from code audit on `main` (section 1); presentation deltas are the HOLD legend, list hierarchy, and resource badges.

---

## 4. Changes implemented

| File | Change |
|---|---|
| `booking-list.tsx` | Hierarchy, next-action copy, `canCreate`, data attributes |
| `bookings/page.tsx` | Pass `events.create` for New Booking |
| `booking-detail.tsx` | Customer/time lead, next-action, resource status badges |
| `allocated-resources.ts` | HOLD-aware group labels (display) |
| `master-schedule-board.tsx` | Legend, HOLD dashed blocks, scroll cue, highlight start, empty mobile list |
| `schedule-board.ts` | Occupancy copy; `resolveScheduleFocus` / `resolveScheduleStartMinute` |
| `schedule/page.tsx` | Honor `type`/`start`; clearer header copy |
| `page.tsx` (Home) | Today empty copy |
| `globals.css` | Thicker `.schedule-timeline-scroll` scrollbar |
| `inquiry-service.ts` | Timezone readable with inquiries **or** events **or** calendar view |
| `employee-bookings-schedule.spec.ts` | Phase 12L authenticated coverage |
| `playwright.config.ts` | Wire bookings-schedule into Event Sales / Front Desk projects |

**Untouched:** HOLD/confirm rules, deposit %, pricing/WP parity, `canDeliver`, Scenario Lab, payment collection, Production writes.

---

## 5. Role-based acceptance

| Role | Result |
|---|---|
| Administrator | Bookings filters, New Booking, schedule HOLD/Booked filters, Home→Bookings→Schedule |
| Event Sales | Bookings + Create Event; HOLD legend |
| Front Desk | Bookings without New Booking; schedule without Create Event; timezone gate fixed |

---

## 6. Responsive results

Document overflow checks at **375, 430, 768, 1024, 1440, 1920** — all passed (Administrator). Timeline remains intentionally scrollable inside the board; document does not overflow.

---

## 7. Test results

| Gate | Result |
|---|---|
| Typecheck | PASS |
| Lint | PASS (0 errors; pre-existing script warnings) |
| Unit | **1012** passed, 1 skipped |
| Production build | PASS |
| Phase 12L E2E | **11** passed, 22 role-skipped |
| Employee regression (`@phase-12j` / `@employee-nav`) | **31** passed, 29 skipped |
| Quote E2E | **3** passed (admin/event-sales/front-desk; one flake on leftover override retried clean) |

### Expected skips (documented)

- Cross-role tests skipped when project role ≠ test role (by design).
- Front Desk still cannot access Inquiries / quote (unchanged).
- No Production writes; synthetic Test Center B only.
- Lifecycle HOLD→Booked mutation coverage remains in existing `@staff` lifecycle specs (not re-run as mutation in 12L).

### Untested / remaining outside scope

- Creating HOLDs or confirming bookings from this UX pass.
- Deposit collection UI (product still does not collect payment).
- Scenario Lab.

---

## 8. Remaining risks

- Deep-link `type` only applies when it matches a known focus id; unknown types fall back to All.
- Occupancy chips still count resources with any reservation today (holds + booked), not instantaneous concurrency.
- Quote E2E can flake if a prior override left unit price ≠ catalog baseline — refresh/retry restores green.
- Timezone OR-gate is intentional continuity; does not grant inquiries or create permissions.

---

## 9. PR and deployment status

- PR: focused branch `phase-12l-bookings-schedule-ux` (open for review — timezone RBAC continuity is not presentation-only).
- Do **not** auto-merge per Phase 12L merge rule.
- No Vercel Preview dependency; local `next start` + Clerk TEST auth only.
