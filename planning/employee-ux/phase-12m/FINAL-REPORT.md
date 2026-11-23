# Phase 12M — PR #30 security acceptance & Production release

**Date:** 2026-11-22  
**PR:** https://github.com/rzounlom/magic-crm/pull/30 (**MERGED**)  
**Merge commit:** `82ce30d`  
**Security follow-up commit:** `580a794` (12M acceptance specs)  
**Release decision:** **RELEASED** — authorization narrowly scoped and verified; full regression green; customer Production Ready.

---

## 1. Authorization diff review

Compared `origin/main...phase-12l-bookings-schedule-ux` before merge.

| Area | Change | Verdict |
|---|---|---|
| Timezone gate | `getCurrentTenantTimezone` accepts `crm.inquiries.view` **OR** `events.view` **OR** `calendar.view` | Narrow continuity fix |
| Booking list create CTA | UI gated by `events.create` | Presentation of existing policy |
| Schedule deep-links | `type`→focus alias; `start`→highlight minute (presentation) | No writes |
| HOLD/Booked chrome | CSS/labels/legend; occupancy **copy** only | Counting logic unchanged |
| Pricing / WP / HOLD rules / schema / emails | **Not in diff** | Untouched |

**No unintended changes** to pricing, availability math, booking transitions, Prisma schema, or customer communication.

---

## 2. Role-permission matrix (Bookings / Schedule)

| Capability | Admin | Event Sales | Front Desk |
|---|---|---|---|
| View Bookings (`events.view`) | Yes | Yes | Yes |
| New Booking UI + `/app/bookings/new` | Yes | Yes | **Denied** (server panel) |
| Create via `createEmployeeManualInquiry` | Yes | Yes | **FORBIDDEN** (server + integration) |
| View Schedule (`calendar.view`) | Yes | Yes | Yes |
| Create Event on schedule | Yes | Yes | No |
| Timezone read (after 12L) | Yes | Yes | Yes (via events/calendar view) |
| Inquiries / quote | Yes | Yes | No (unchanged) |

---

## 3. Timezone access findings

- Data still loaded with `organizationId: ctx.organizationId` and optional `locationId` scoped to that org.
- Returns only timezone strings — no inquiry/booking payloads.
- Does **not** grant `events.create`, `events.edit`, `crm.inquiries.manage`, or HOLD/confirm.
- Downstream pages still enforce `events.view` / `calendar.view` for list/board data.
- Direct actions (`createEmployeeManualInquiry`, HOLD services, confirm) retain their own `requirePermission` checks.

---

## 4. New Booking server enforcement

| Check | Result |
|---|---|
| Front Desk: New Booking button hidden on list | PASS (E2E) |
| Front Desk: `GET /app/bookings/new` shows permission panel, no form | PASS (`@phase-12m`) |
| Event Sales / Admin: create surface loads | PASS |
| Server: `createEmployeeManualInquiry` requires `events.create` + `crm.inquiries.manage` | Confirmed in code + existing integration (`segment-scheduling`, `master-schedule-board`) |
| No Production bookings created | Confirmed |

---

## 5. HOLD / booking occupancy findings

- HOLD blocks: dashed border + **HOLD** label + legend text (“temporary, not confirmed”).
- Booked blocks: solid primary styling + **Booked**.
- Occupancy chips: copy clarifies “(holds + booked)”; `occupancyCount` semantics **unchanged** (unit-guarded).
- Released allocations labeled Released on booking detail; not presented as active Booked occupancy.
- HOLD vs confirm mutation separation: unchanged server rules; LA E2E still asserts distinct readiness (read-only). No HOLD/confirm exception paths added.

---

## 6. Deep-link validation

| Input | Behavior |
|---|---|
| `type=holds` / `focus=holds` | Holds filter pressed |
| `type=<unknown>` | Falls back to All resources |
| `start=99:99` / invalid | Ignored; no highlight; no crash |
| `start=17:00` | Presentation highlight/scroll only |
| `builder=` as Front Desk | No Create Event / dialog escalation |
| Permission bypass via query | None — board still behind `calendar.view` |

Deep links do not trigger booking writes.

---

## 7. Full regression results

| Gate | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|
| Typecheck | PASS | 0 | — | |
| Lint | PASS | 0 errors | 4 pre-existing warnings | |
| Unit | **1013** | 0 | 1 | +1 occupancy/deep-link unit |
| Production build | PASS | 0 | — | |
| Quote E2E (`pnpm test:e2e:quote`) | **7** | 0 | 0 | Full suite |
| 12L + 12M bookings/schedule E2E | **17** | 0 | 34 | Role skips by design |
| Employee `@phase-12j` / nav / LA / home | **44** (+ **6** retry) | 0* | 63 | *4 initial timeouts when `next start` died mid-suite; clean retry PASS |

### Quote “3 vs 7” investigation

Phase 12L reported **3** quote passes when run with `--no-deps` (acceptance tests only).  
The established **7** count from Phase 12I/J/K is:

1. `setup-clerk`  
2–4. `setup-auth` × Administrator / Event Sales / Front Desk  
5–7. quote-admin / quote-event-sales / quote-front-desk acceptance  

**Full** `pnpm test:e2e:quote` in 12M: **7 passed**. Coverage was not missing — subset reporting only.

---

## 8. Responsive / accessibility acceptance

| Viewport | Document overflow (Bookings + Schedule) |
|---|---|
| 375, 430, 768, 1024, 1440, 1920 | PASS (Administrator E2E) |

- Schedule timeline keeps intentional horizontal scroll; document does not overflow.
- HOLD legend uses text + dashed vs solid pattern (not color alone).
- Booking filters + schedule filter toolbar keyboard-reachable (`@phase-12m` / `@phase-12l`).
- Mobile list surface remains available when events exist; empty day uses EmptyState without duplicate list.

---

## 9. PR #30 merge status

| Item | Status |
|---|---|
| Security acceptance | PASS |
| Merge | **MERGED** `82ce30d` |
| Auto-merge deferred earlier | Correct — timezone OR-gate reviewed in 12M then merged |

---

## 10. Production deployment status

| Item | Status |
|---|---|
| Vercel Production | **Ready** (`magic-kq7q3t05q…`, target production, 46s build) |
| Alias | `https://magic-crm-eta.vercel.app` |
| Signed-out smoke | `/` **200**, `/sign-in` **200**, `/app` → sign-in redirect (**307**) |
| `/app/bookings`, `/app/schedule` unauthenticated | Auth redirect (no anonymous data) |
| Authenticated Production staff smoke | **Not executed** — E2E Clerk TEST tickets are synthetic/localhost; no Production staff session used (avoids Production credential risk). HOLD/Bookings UX verified on Test Center B via authenticated local E2E. |
| Production writes | **None** |
| Preview dependency | **None** (Preview deploys may Error; ignored per policy) |

---

## 11. Safeguards preserved

Unchanged: `approved_plugin_baseline`, `finalLivePriceRevalidation: pending`, `canDeliver: false`, 25% deposit, VERIFIED hours, HOLD/confirm rules, quote delivery restrictions, customer email/payment config, live WP plugin, Scenario Lab.

---

## 12. Remaining risks

- Occupancy chips still mean “any reservation today,” not concurrent capacity at a single minute.
- Quote unit-price E2E can flake if a prior override left non-catalog cents — full suite with retries is clean.
- Authenticated Production UI for Bookings/Schedule not re-clicked with Production Clerk (policy/safety); rely on Vercel Ready + local role E2E.
- Long employee suites can starve a local `next start` process — run with a dedicated server process and/or retries.

---

## Definition of done

PR #30 is merged and customer Production is Ready after authorization, New Booking server denial, HOLD/confirmed separation, deep-link fail-safe behavior, and full regression (including full 7-test quote suite) passed authenticated acceptance without unauthorized access or Production booking mutations.
