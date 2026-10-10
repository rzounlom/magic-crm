# SBF1 — Staff Booking Confirmation Operations

**Status:** Complete for confirmation readiness + authorized hours exceptions.  
**FULL INTEGRATION NOT RUN — run separately before milestone/merge/deployment.**

Design north star (Airbnb/PayPal-inspired UX) remains deferred — this phase uses existing staff components only.

---

## 1. Existing staff flow map

| Step | Path | Pre-SBF1 status |
|---|---|---|
| Inquiry detail | `/app/inquiries/[id]` → `LiveAgentWorkspace` | Functional |
| Staff planning | Agent working plan form + availability check | Functional |
| Proposal review | Selected / working plan snapshots | Functional |
| Pending booking | `savePendingBookingAction` → `upsertPendingBookingFromPlan` | Functional under unconfigured hours |
| Confirmation | `LiveAgentBookingActions` → `confirmBookingAction` → `confirmInquiryBooking` → `confirmPendingBooking` | **Blocked** on unconfigured/unverified/closed hours; no exception UI |
| Calendar / booking detail | `/app/schedule`, `/app/bookings/[id]` | Functional (read) |
| Manual / proposal HOLD | `placeManualHoldAction`, `placeInquiryHoldAction`, `updateInquiryHoldAction` | Fail-closed on hours; **no exception wiring in UI** |

R2D.4 engine guarantees (atomic exception consume, exclusion, permissions) remain the source of truth. Final confirmation always revalidates transactionally.

---

## 2. New action / route contracts

| Action | Auth | Input (trusted derivation) | Behavior |
|---|---|---|---|
| `authorizeConfirmHoursExceptionAction` | Clerk + `events.confirm` | `inquiryId`, `reason` (8–500). Fingerprint from server inquiry/plan | Creates `CONFIRM_BOOKING` exception |
| `revokeConfirmHoursExceptionAction` | Clerk + `events.confirm` | `inquiryId`, `exceptionId` (must match org/location/purpose) | Revokes unused exception |
| `loadConfirmationReadinessAction` | Clerk + view/confirm | `inquiryId` | Returns readiness snapshot |
| `confirmBookingAction` (updated) | Clerk + confirm/CRM | `inquiryId`, optional `hoursExceptionId` | Passes exception into existing confirm path |

No public/customer routes. No client-supplied org/user/location/date/time for authorize.

---

## 3. Permission and tenant boundaries

- Organization from `getRequestContext()` only.
- Authorize/revoke/confirm require `events.confirm` (confirm also requires CRM manage via existing service).
- Readiness viewable with `crm.inquiries.view` or `events.confirm`.
- Front Desk (no `events.confirm`) cannot authorize.
- Cross-org location IDs fail closed.
- Forged staff identities fail permission lookup.

---

## 4. Confirmation readiness semantics

Service: `getConfirmationReadiness` (`src/server/services/confirmation-readiness-service.ts`).

Uses existing `bookingConfirmationBlockers`, `evaluateWritableOccupancy`, and `checkResourceAvailability` — no parallel engines.

| State | Meaning |
|---|---|
| `ALREADY_CONFIRMED` / `CANCELLED` | Terminal |
| `BLOCKED_DATA` | Missing plan/date/time/guests/pricing |
| `BLOCKED_INVALID_LOCAL_TIME` | Non-overridable |
| `BLOCKED_HOURS_*` / `BLOCKED_OUTSIDE_HOURS` | Overridable with exact staff exception |
| `BLOCKED_RESOURCE_CONFLICT` / `BLOCKED_INVENTORY` | Non-overridable by hours exception |
| `READY_WITH_EXCEPTION` | Matching active exception present; confirm still rechecks |
| `NEEDS_FINAL_VALIDATION` | Advisory OK; confirm rechecks availability |

Never presents an absolute “Ready” guarantee when final confirm must revalidate.

---

## 5. Staff exception UI behavior

On inquiry detail (when a selected plan exists):

- **Confirmation readiness panel** — date/time/location/TZ, booking status, blockers, distinction between hours vs resource conflict.
- **Authorize exception** — visible with `events.confirm` when hours are overridable and no active exception; requires reason + confirm dialog; shows exact window.
- **Revoke** — unused active exception only.
- Copy states exceptions do not override inventory/safety checks.

---

## 6. Final confirmation transaction path

Unchanged engine path from R2D.4:

1. `confirmBookingAction` reads optional `hoursExceptionId`.
2. `confirmInquiryBooking` → `confirmPendingBooking`.
3. Hours validated without consume; consume inside occupancy `$transaction` after availability succeeds.
4. Failure rolls back consume; success consumes once; repeat confirm is idempotent for already-confirmed.

---

## 7. HOLD path findings

| Action | Hours exception support |
|---|---|
| `placeProposalHold` / `placeManualHold` (services) | Accept `hoursExceptionId` (R2D.4) |
| `placeInquiryHoldAction` / `placeManualHoldAction` / `updateInquiryHoldAction` | **Not wired** to exception UI |
| `updateInquiryPlanHold` | Passes `hoursExceptionId: null` — fail-closed under unresolved/closed hours |

**Decision:** HOLD exception UI is **SBF2**. Wiring would need a second staff workflow (hold placement panel). Do not bypass guards.

---

## 8. Payment-neutral status findings

- `PENDING_PAYMENT` means “pending booking / not confirmed occupancy,” **not** that MagicCRM collected money.
- External payment attestation (`paymentConfirmedExternallyAt`) remains an existing staff attestation of money received **outside** MagicCRM — not processor capture.
- No Stripe/PayPal assumption, no 1% fee, no tax collection, no status migration in this phase.
- Recommend a future rename/docs pass (e.g. “Pending confirmation”) without a breaking migration here.

---

## 9. Files changed

- `src/types/confirmation-readiness.ts`
- `src/server/services/confirmation-readiness-service.ts`
- `src/server/actions/hours-exceptions.ts`
- `src/server/actions/bookings.ts` (exception id)
- `src/server/resources/hours-exception.ts` (`findActiveHoursException`)
- `src/components/layout/confirmation-readiness-panel.tsx`
- `src/components/layout/confirmation-hours-exception-form.tsx`
- `src/components/layout/live-agent-booking-actions.tsx`
- `src/components/layout/live-agent-workspace.tsx`
- `src/app/app/inquiries/[id]/page.tsx`
- `tests/integration/staff-confirmation-operations.test.ts`
- This document

---

## 10. Tests

- Focused integration: `tests/integration/staff-confirmation-operations.test.ts` (2/2 passed)
  - Unconfigured hours readiness
  - Unauthorized / cross-org denial
  - Invalid reason
  - Authorize → revoke → re-authorize
  - Stale exception reject
  - Confirm consumes once; repeat confirm safe
  - Failed confirm preserves exception
- Unit: 537 passed; lint/typecheck/build passed.

---

## 11. DEV verification (Generations)

Read-only via prior R2D.4 inspect patterns (unchanged expectations):

- Location TZ `America/Indiana/Indianapolis`
- No operating-hours policy seeded
- Tax disabled / unset
- Prices/promotions unchanged
- No real Generations customer bookings created in this phase
- Missing-hours state is now explained in staff UI instead of a silent confirm failure

---

## 12. Remaining workflow gaps

1. HOLD exception authorize/consume UI (`placeInquiryPlanHold`, `updateInquiryPlanHold`, manual HOLD).
2. `confirmBookingAction` still depends on Clerk request context in browser — integration tests cover services/actions’ shared engines.
3. Misleading `PENDING_PAYMENT` label semantics.
4. No approved Generations operating-hours policy (management decision).
5. No payment processor / deposit collection.

---

## 13. Recommended SBF2 scope

1. Minimal HOLD hours-exception controls on existing hold actions (same fingerprint/authorize/revoke patterns, purpose `PLACE_HOLD`).
2. Wire `hoursExceptionId` through `placeInquiryHoldAction` / `updateInquiryHoldAction` / `placeManualHoldAction`.
3. Optional: clearer booking status labels without destructive migration.
4. Keep payments, tax, redesign, and hours policy seeding out of scope unless separately approved.
