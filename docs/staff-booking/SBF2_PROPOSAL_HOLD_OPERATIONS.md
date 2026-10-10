# SBF2 — Staff Proposal HOLD Operations & Workflow Continuity

**Status:** Complete for HOLD readiness + `PLACE_HOLD` hours exceptions + wired staff HOLD actions.  
**FULL INTEGRATION NOT RUN — run separately before milestone/merge/deployment.**

Design north star (Airbnb/PayPal-inspired UX) remains deferred — this phase uses existing staff components only.

---

## 1. Existing HOLD path inventory

| Entry / action | Creates active reservation? | Pre-SBF2 | SBF2 |
|---|---|---|---|
| Inquiry detail → working plan save | No | Advisory only | Unchanged |
| Check Availability | No | Advisory | Unchanged |
| `placeInquiryHoldAction` → `placeInquiryPlanHold` → `placeProposalHold` | **Yes** (24h HOLD rows) | Hours fail-closed; no exception UI; action unused in UI | Optional `hoursExceptionId`; Place HOLD UI; readiness panel |
| `updateInquiryHoldAction` → `updateInquiryPlanHold` | Updates / replaces HOLD rows | `hoursExceptionId: null` | Optional `hoursExceptionId`; consume in same txn |
| `placeManualHoldAction` → `placeManualHold` | **Yes** (single resource) | Service accepted exception; action unwired | Action accepts `hoursExceptionId` |
| `releaseInquiryHoldsAction` / `releaseHoldAction` | Releases HOLD | Functional | Unchanged |
| `extendInquiryHoldAction` / `expireInquiryHoldNowAction` | Extends / expires HOLD | Functional | Unchanged |
| Confirm booking path | Creates BOOKED (not HOLD) | SBF1 | Separate `CONFIRM_BOOKING` purpose |

**Not every save creates a HOLD.** Plan edits and availability checks remain non-reserving.

---

## 2. Staff journey flow map

```
Inquiry open
  → Review requirements / claim (start working)
  → Edit agent working plan (no HOLD)
  → Check availability (advisory)
  → HOLD readiness panel
       ├─ Authorize PLACE_HOLD hours exception (if needed)
       └─ Place HOLD (transactional revalidation)
  → View HOLD resources + 24h expiration
  → Release / update / extend / expire HOLD as needed
  → Confirm via existing confirmation readiness (SBF1) — separate exception purpose
```

Small continuity fixes in this phase:

- Place HOLD controls restored on inquiry detail (readiness panel + rooms/lanes section).
- `liveAgentHoldReadiness` no longer hardcodes `canPlaceHold: false`.
- Active HOLD labeled clearly (not “Legacy hold” only).
- Update HOLD passes matching `hoursExceptionId` when present.

---

## 3. HOLD readiness semantics

Service: `getHoldReadiness` (`src/server/services/hold-readiness-service.ts`).

Uses existing `evaluateWritableOccupancy` and `checkResourceAvailability` — no parallel engines.

| State | Meaning |
|---|---|
| `ALREADY_BOOKED` | Inquiry already booked |
| `ALREADY_HELD` | Active unreleased HOLD present; duplicate place blocked |
| `BLOCKED_DATA` | Missing plan/date/time |
| `BLOCKED_INVALID_LOCAL_TIME` | Non-overridable |
| `BLOCKED_HOURS_*` / `BLOCKED_OUTSIDE_HOURS` | Overridable with exact `PLACE_HOLD` staff exception |
| `BLOCKED_RESOURCE_CONFLICT` / `BLOCKED_INVENTORY` / `BLOCKED_NO_RESOURCES` | Non-overridable by hours exception |
| `READY_WITH_EXCEPTION` | Matching active exception; HOLD still rechecks |
| `NEEDS_FINAL_VALIDATION` | Advisory OK; HOLD rechecks availability |

Never presents an absolute availability guarantee. Final HOLD placement revalidates transactionally.

---

## 4. Server action contracts

| Action | Auth | Input (trusted derivation) | Behavior |
|---|---|---|---|
| `authorizePlaceHoldHoursExceptionAction` | Clerk + `events.confirm` | `inquiryId`, `reason` (8–500). Fingerprint from server plan | Creates `PLACE_HOLD` exception |
| `revokePlaceHoldHoursExceptionAction` | Clerk + `events.confirm` | `inquiryId`, `exceptionId` (org/location/`PLACE_HOLD`) | Revokes unused exception |
| `loadHoldReadinessAction` | Clerk + view/create/confirm | `inquiryId` | Returns readiness snapshot |
| `placeInquiryHoldAction` (updated) | Clerk + create + CRM manage | `inquiryId`, optional `hoursExceptionId` | Places proposal HOLD |
| `updateInquiryHoldAction` (updated) | Clerk + create + CRM manage | `inquiryId`, optional `hoursExceptionId` | Updates HOLD under hours guard |
| `placeManualHoldAction` (updated) | Clerk + create | Manual window fields + optional `hoursExceptionId` | Single-resource HOLD |

No client-supplied bypass flags. No client-supplied org/user/location/date/time for authorize fingerprint.

---

## 5. Exception authorization boundaries

- Organization from `getRequestContext()` only.
- Authorize/revoke require `events.confirm`.
- Purpose must be `PLACE_HOLD` (confirm exceptions cannot authorize HOLD).
- Exact occupancy fingerprint: location + slotDate + start/end minutes + purpose + inquiry binding.
- Reason 8–500 characters; TTL default 2 hours; one-time consume; audited.
- Cross-tenant location IDs fail closed.
- Front Desk (no `events.confirm`) cannot authorize.
- Revocation only before consumption.

---

## 6. Transaction and concurrency guarantees

Unchanged engine path from R2D.4:

1. Hours validated without consume (`consumeException: false`).
2. Availability assigned under location advisory lock.
3. Consume exception inside the same `$transaction` as successful HOLD insert/update.
4. Failure rolls back consume; success consumes once.
5. Duplicate active HOLD for the same inquiry rejected.
6. PostgreSQL `resource_reservations_no_overlap_instants` exclusion remains authoritative for overlapping occupancy.
7. Proposal HOLD duration remains the established **24-hour** policy (`DEFAULT_HOLD_HOURS`).

---

## 7. UI behavior

On inquiry detail (when a selected plan exists):

- **Proposal HOLD readiness panel** — date/time/location/TZ, resource assignments, blockers, HOLD state/expiration, Place HOLD when eligible.
- **Authorize / revoke PLACE_HOLD exception** — visible with `events.confirm` when hours are overridable.
- **Rooms and lanes** — Place HOLD when none active; Release / Update / Extend / Expire when active; Update carries `hoursExceptionId` when present.

Confirmation readiness (SBF1) remains a separate panel with `CONFIRM_BOOKING` purpose.

---

## 8. HOLD expiration / release

| Operation | Behavior |
|---|---|
| Automatic expiry | Existing release-expired path; resources become available |
| Expire now | Same expiry path as automatic 24h expiry |
| Release | Sets `releasedAt`; occupancy freed immediately |
| Extend | Extends `expiresAt` by another hold window |
| After expiry | Staff must place a new HOLD; prior exception is not reused if consumed |

---

## 9. Payment neutrality / legacy status

- `PENDING_PAYMENT` still means “pending booking / not confirmed occupancy,” **not** that MagicCRM collected money.
- No payment processor integration, no Stripe assumption, no 1% fee, no deposit marked received without a trusted payment record.
- Booking status and payment status remain separate.
- **SBF3 candidate:** rename/docs pass for `PENDING_PAYMENT` without a breaking migration.

---

## 10. Generations DEV safety (read-only)

Verified against prior R2C/R2D findings and seed posture (this phase did not mutate Generations):

- Scheduling TZ target remains `America/Indiana/Indianapolis`.
- No approved operating-hours policy is seeded by this phase.
- Tax remains disabled / unchanged.
- Prices, promotions, historical bookings, and reservations are not modified by SBF2.

All end-to-end HOLD workflows use synthetic TEST fixtures.

---

## 11. SBF3 candidates (documented only)

- Sticky booking-guide “Place HOLD” step vs confirm-without-HOLD divergence with `markInquiryReadyToFinalize`.
- Unified readiness surface (HOLD + confirm) without dual panels.
- `PENDING_PAYMENT` terminology cleanup.
- Generations approved operating-hours policy (tenant config — not engine).
- Broader schedule-board manual HOLD UI for exceptions.

---

## 12. Files changed

- `src/types/hold-readiness.ts`
- `src/server/services/hold-readiness-service.ts`
- `src/server/actions/hours-exceptions.ts` (`PLACE_HOLD` authorize/revoke/load)
- `src/server/actions/resource-schedule.ts` (`hoursExceptionId` wiring)
- `src/server/services/resource-hold-service.ts` (pass/consume exception on place/update)
- `src/components/layout/hold-readiness-panel.tsx`
- `src/components/layout/hold-hours-exception-form.tsx`
- `src/components/layout/employee-selected-plan-resource-check.tsx`
- `src/components/layout/live-agent-workspace.tsx`
- `src/app/app/inquiries/[id]/page.tsx`
- `src/lib/inquiries/live-agent-next-step.ts`
- `tests/integration/staff-hold-operations.test.ts`
- `docs/staff-booking/SBF2_PROPOSAL_HOLD_OPERATIONS.md`

---

## 13. Validation

Run for this phase:

- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test:unit`
- Focused: `tests/integration/staff-hold-operations.test.ts` (+ existing R2D4 HOLD exception coverage in `booking-transaction-safety`)
- `corepack pnpm build`

Do **not** treat full integration as part of SBF2 completion.
