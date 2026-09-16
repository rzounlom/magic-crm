# ADR-006: Database-enforced resource occupancy

## Status

Accepted (Phase 3B)

## Context

Two customers can see the same bowling lane as available and accept overlapping proposals at the same moment. An application preflight (`checkResourceAvailability` then insert) is not sufficient. MagicCRM already stored occupancy as `ResourceReservation` HOLD/BOOKED rows with PostgreSQL `btree_gist` exclusion `resource_reservations_no_overlap` from the finite resource schedule pass.

QStash is documented as a later optional scheduler. It is not a dependency today.

## Decision

1. **Reuse `ResourceReservation`.** Do not add a second calendar. Occupancy remains event-local `slotDate` + `startMinute`/`endMinute`. UTC `startsAt`/`endsAt` are derived from location or organization timezone for display and future email.
2. **PostgreSQL exclusion is the last line of defense.** Constraint `resource_reservations_no_overlap` rejects overlapping active HOLD/BOOKED ranges on the same `resourceId` + `slotDate` while `releasedAt IS NULL`. `createMany` of multiple units is one statement inside a transaction; a conflict rolls back the entire allocation (no partial 5-lane hold).
3. **Same-inquiry double-click uses `SELECT … FOR UPDATE` on the Inquiry row** before assignment, then returns the existing hold DTO if a HOLD already exists.
4. **Active HOLD** = `status = HOLD AND releasedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now)`. Availability queries ignore expired HOLDs even if the sweeper has not run. BOOKED never expires.
5. **Expiration is opportunistic + explicit, not QStash.** `releaseExpiredHolds` runs before availability checks and on `expireHold` / `expireInquiryHoldsNow`. No production QStash callback in this phase.
6. **Customer accept places HOLD, not Booking.** Follow-up (`Have an agent contact me`) writes `salesStage = READY_TO_BOOK` with zero reservations. Staff Confirm Booking and a future Stripe webhook share `confirmHeldBooking`.

## Consequences

- Neon PostgreSQL already has `btree_gist` from `20260909140000_finite_resource_schedule`. No new extension is required.
- Overnight windows that cross local midnight remain a known limitation of `slotDate`.
- A delayed sweeper cannot keep expired HOLDs blocking availability checks; it only clears the gist exclusion for new inserts.
- Administrators cannot silently override collisions in this phase.
