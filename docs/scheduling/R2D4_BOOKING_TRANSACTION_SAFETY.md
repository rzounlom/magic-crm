# R2D.4 — Booking Transaction Integrity & Staff Exception Safety

**Status:** Verification phase complete. Focused corrective fix shipped for exception consumption atomicity.  
**FULL INTEGRATION NOT RUN — run separately before milestone/merge/deployment.**

Related: [`R2D3_FINAL_BOOKING_SAFETY.md`](./R2D3_FINAL_BOOKING_SAFETY.md), [`planning/architecture/design-north-star.md`](../../planning/architecture/design-north-star.md) (UX redesign not started).

---

## 1. Transaction boundary map

| Path | Auth | Hours / exception | Shared DB transaction (writes) |
|---|---|---|---|
| `confirmInquiryBooking` → `confirmPendingBooking` | `events.confirm` + `crm.inquiries.manage` | Validate outside; **consume inside** after availability OK | Booking upsert, line items, exception consume, BOOKED reservations, inquiry BOOKED, audits |
| `confirmHeldBooking` | Same as confirm | Same | Same (alias) |
| `placeProposalHold` | Caller-supplied org (employee wrappers require `events.create` / CRM) | Validate outside; **consume inside** after HOLD uniqueness check | Inquiry lock, location lock, exception consume, HOLD inserts, plan select, audits |
| `placeManualHold` | `events.create` | Validate outside; **consume in** `reserveResourcesInTransaction.beforeCreate` after exclusivity checks | Location lock, exception consume, HOLD insert |
| `updateInquiryPlanHold` | `events.create` + CRM | Fail-closed hours check; **no exception id wired** | HOLD update/replace transaction |
| `authorizeOperatingHoursException` / `revokeOperatingHoursException` | `events.confirm` via `requirePermission` | N/A | Create/revoke row + audit (not part of occupancy write) |

**Pre-R2D.4 defect:** `loadAndConsumeHoursException` ran in `assertWritableOccupancyOrThrow` **before** the occupancy `$transaction`, so reservation/booking failure could leave a consumed exception.

**R2D.4 contract:**

1. `assertWritableOccupancyOrThrow({ consumeException: false })` validates fingerprint only.
2. `consumeValidatedHoursException(tx, pending)` runs inside the same write transaction as reservation/booking success path.
3. Soft availability-conflict returns from confirm **do not** consume the exception.
4. Conditional `updateMany` (`consumedAt IS NULL`) serializes concurrent consumers at the database.

---

## 2. Staff exception authorization model

- Server-only helpers in `src/server/resources/hours-exception.ts`.
- Authorization uses trusted `RequestContext` + `requirePermission(..., EVENTS_CONFIRM)`.
- Location must belong to `ctx.organizationId`.
- Permissions are **organization-scoped** (no per-location permission matrix today).
- **Not** exposed via server actions/routes in this phase — operational blocker for staff UI.
- `confirmBookingAction` does not accept/pass `hoursExceptionId`.
- Client-supplied user ids or permission flags are never trusted.

---

## 3. Exception consumption semantics

- Bound to org, location, `slotDate`, `startMinute`, `endMinute`, `purpose` (`CONFIRM_BOOKING` | `PLACE_HOLD`).
- Optional inquiry/booking binding when set at authorize time.
- Rejects revoked, expired, already-consumed, status mismatch, purpose mismatch, fingerprint drift.
- Cannot override `INVALID_LOCAL_TIME`, resource conflicts, capacity, or cross-tenant isolation.
- Default TTL 2 hours.

---

## 4. Database timestamp representation

| Layer | Contract |
|---|---|
| Prisma `startsAt` / `endsAt` | `DateTime` → PostgreSQL `TIMESTAMP WITHOUT TIME ZONE` |
| Application | Stores UTC-normalized absolute instants from strict local-time resolution |
| Exclusion | `resource_reservations_no_overlap_instants` uses `tsrange("startsAt","endsAt",'[)')` |
| Session TZ | Verified independent: inserts under `SET TIME ZONE 'America/Los_Angeles'` still exclude on absolute stored values |
| Predicate | Active rows only: `releasedAt IS NULL` and `status IN ('HOLD','BOOKED')` with non-null instants |

Same-day `int4range` exclusion remains complementary. Released/cancelled occupancy does not participate.

---

## 5. Concurrency outcomes (TEST)

- Two confirmations sharing one exception (separate Prisma clients): **exactly one** confirms; exception consumed once.
- Two concurrent overnight-overlapping reservation inserts (separate clients): **exactly one** succeeds via `resource_reservations_no_overlap_instants`.
- Sequential confirm of overnight-overlapping inquiries: first confirms; second fails; loser exception remains unconsumed.
- Reservation conflict before confirm: exception remains unconsumed.
- Manual HOLD conflict: exception remains unconsumed.

---

## 6. DEV rollout impact (read-only, `ep-bold-art`)

Inspected via `scripts/r2d4-dev-rollout-inspect.ts`:

- **2/2** active locations lack operating-hours policies (Generations Main + magiccrm-test-center-b).
- Confirm/HOLD under unconfigured hours **fail closed** without a staff exception.
- Exception authorize/revoke helpers exist server-side only — **no staff UI / server action**.
- Confirmation errors surface `OPERATING_HOURS_UNRESOLVED` / `OUTSIDE_OPERATING_HOURS` / `HOURS_EXCEPTION_*` user messages.
- Pending bookings remain creatable under unconfigured hours; pending rows stay accessible for follow-up.

### Generations CRM Test

| Check | Result |
|---|---|
| Location TZ | `America/Indiana/Indianapolis` |
| Operating-hours policy | Absent |
| Tax calculation/collection | No settings row (disabled) |
| Product prices / promotions | Unchanged counts (57 / 3) |
| Future bookings / active HOLDs | 0 / 0 |
| Historical bookings / reservations | 7 / 44 (preserved) |

No hours seeded. No tax activated. No Generations bookings created.

---

## 7. Remaining operational blockers

1. **No staff exception workflow UI** — authorize/revoke/consume cannot be driven from the employee app yet.
2. **`confirmBookingAction` cannot pass `hoursExceptionId`** — even with a service-layer exception, the current action path cannot confirm under unresolved/closed hours.
3. **`updateInquiryPlanHold` does not accept exceptions** — HOLD updates under unresolved/closed hours remain blocked.
4. **Tenants without verified hours** (including Generations) will see confirm/HOLD blocks until hours are approved or an authorized exception path is exposed.
5. Design north star (Airbnb/PayPal-inspired UX) is documented separately and **not** started.

---

## 8. Production-readiness caveats

- Database exclusion + atomic exception consume are necessary but not sufficient for production booking: payments, deposit, checkout HOLDs, and approved operating-hours policies remain separate.
- Neon pooler concurrency tests require **separate Prisma clients** per concurrent transaction.
- `upsertPendingBookingFromPlan` interactive transaction timeout raised to 20s (aligned with confirm) for Neon multi-round-trip latency — not a substitute for reducing transaction work.
- Full integration suite not run in this phase.

---

## 9. Files touched (R2D.4)

- `src/server/resources/hours-exception.ts` — assert/consume split
- `src/server/resources/scheduling-guards.ts` — deferred consume API
- `src/server/services/pending-booking-service.ts` — consume inside confirm tx; pending upsert timeout
- `src/server/services/proposal-hold-service.ts` — consume inside HOLD tx
- `src/server/services/resource-hold-service.ts` — consume inside manual HOLD tx
- `src/server/services/resource-availability-service.ts` — `beforeCreate` hook
- `tests/helpers/cleanup-test-organizations.ts` — delete staff exceptions before bookings
- `tests/integration/booking-transaction-safety.test.ts` — new focused suite
- `tests/unit/hours-exception.test.ts` — purpose/org/location mismatch cases
- `scripts/r2d4-dev-rollout-inspect.ts` — read-only DEV inspect
- Docs: this file; R2D.3 `tsrange` clarification
