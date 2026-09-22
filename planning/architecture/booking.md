# Booking (Phase 3B.4)

A `Booking` is the commercial event intent and, once confirmed, the operational record.

**Pending bookings do not block inventory. Physical resources become unavailable only when a booking is confirmed after payment.**

**Resource reservations use itinerary segment windows, not the full event window.** Axe occupancy is the axe segment; bowling occupancy is the bowling segment. The event start/end is not automatically the resource reservation window.

Inquiry remains the sales/customer conversation. One Inquiry produces at most one Booking in this MVP (`@@unique([organizationId, inquiryId])`), including cancelled rows. Employees can create an Inquiry with `source = EMPLOYEE` (no public conversation) and then use the same confirmation engine. Proposal edits before confirmation update that pending booking in place. Confirmed booking snapshots are treated as immutable until cancellation.

**Cancellation is the operational lifecycle. Do not hard-delete Booking or Inquiry records.** After a booking is cancelled, create a new booking (new inquiry) to test again. The unique inquiry slot is occupied by the cancelled row on purpose.

## Status

| Status | Meaning | Occupies inventory |
| --- | --- | --- |
| `PENDING_PAYMENT` | Unpaid booking intent from Book Now or an employee save | No |
| `CONFIRMED` | Payment attested (or future Stripe deposit) and exact resources allocated | Yes (`ResourceReservation` BOOKED) |
| `CANCELLED` | Employee cancelled pending or confirmed booking. History is kept. | No |
| `COMPLETED` | Reserved for post-event | Historical |

Do not confuse pending bookings with `ResourceReservation`. A pending booking is not a HOLD.

## Customer funnels

**Book Now** (`bookPublicEventPlan`): public conversation token → persist/update one pending Booking from the selected proposal snapshot → `Inquiry.salesStage = DEPOSIT_PENDING` → no `ResourceReservation` rows. Copy must not claim inventory is reserved.

**Submit inquiry** (`selectPublicEventPlan`): `READY_TO_BOOK` / Ready for live agent. No Booking. No occupancy.

## Employee workspace

Employees can open **New Booking** from `/app/bookings` without a public inquiry. That creates an `Inquiry` (`source = EMPLOYEE`, assigned to the actor, no conversation) and generates catalog plans with the same engine as public intake.

The inquiry employee page is a derived view of persisted state. It does not mix these concepts:

| Concept | Meaning |
| --- | --- |
| **Original customer selection** | Immutable `EventPlanRecommendation` (`kind = RECOMMENDATION`) the customer booked or submitted. Staff edits never overwrite it. |
| **Working booking plan** | Editable `AGENT_WORKING` draft. Start Working assigns the inquiry and copies the selected snapshot. Saving recalculates price, itinerary, and resource requirements from catalog/sales knowledge. Staff never type the total. |
| **Confirmed booking** | The `Booking` snapshot after Confirm Payment & Book. Display as **Booked plan**, not “working”. |
| **Allocated resources** | Unreleased `ResourceReservation` rows with `status = BOOKED` for that booking. Show assigned unit names, 12-hour windows, and allocated / total active inventory. |
| **Legacy HOLD** | Unreleased `ResourceReservation` rows with `status = HOLD` from the old hold workflow only. New Book Now / confirm paths must not create or display these. |

Derived presentation states (not new database enums): `UNCLAIMED_PENDING_BOOKING`, `WORKING_PENDING_BOOKING`, `PAYMENT_CONFLICT`, `CONFIRMED_BOOKING`, `CANCELLED_BOOKING`, `LEGACY_HOLD`.

Customer Book Now already chose Good / Recommended / Premium. The employee page does not show one-click **Switch package**. Edits belong on the working plan.

**Start Working** assigns the inquiry and unlocks working-plan editing. It does not change the customer proposal, create reservations, or reprice by itself.

Review/edit date, time, guest count, duration, and selected activities (server-owned repricing). **Check Availability** reads the current proposal's **segment-level** resource windows and does not insert occupancy. That check is pending-only. After confirmation, show allocated reservations — never “Available. All required resources are currently free.” After cancellation, show released history and hide booking workflow controls.

**Save Pending Booking** persists unpaid commercial intent. **Confirm Payment & Book** is the temporary external-payment path: the employee attests that required payment was received outside MagicCRM.

Public and employee booking use the same scheduling/allocation engine (`stampPlanResourceWindows` → `checkResourceAvailability` → `assignExactResourcesForRequirements` inside `confirmPendingBooking`).

There is no Place Hold step on new records. Legacy HOLD rows remain readable/releasable until they expire or convert. Do not label BOOKED allocation rows as Legacy hold.

## Finalization

`confirmPendingBooking` is the canonical allocator. Employee confirmation and a future Stripe webhook must both call it. Do not add a Stripe-specific pathway.

1. Load the trusted booking/inquiry in the organization
2. Require pending/eligible state
3. Snapshot the selected/working proposal, including structured itinerary segments
4. Derive per-segment resource windows (`stampPlanResourceWindows`) and recompute exact resource requirements (composites included)
5. Transaction: lock location, recheck availability **per segment window**, insert all BOOKED rows atomically with those windows, mark CONFIRMED, `Inquiry.salesStage = BOOKED`, audit
6. On conflict: keep the booking pending, set `availabilityConflictAt`, audit `booking.confirmation_conflict`. If the employee attested payment, keep `paymentConfirmedExternallyAt`. Do not invent refunds (Phase 3C).

Mezzanine confirmation uses the generic composite allocator during the **Mezzanine segment only**: specific Mezzanine + all active bowling at the location + exactly 7 axe units + specific Skybox. `LOCATION_EXCLUSIVE` blocks the location only during that product's configured segment/window — not automatically the entire event.

### Catalog after proposal

Accepted proposal / pending booking uses its persisted structured snapshot for line items, price, itinerary, and requirement semantics. Final allocation resolves **current** active physical resources. Admin catalog price changes do not silently reprice a customer-accepted snapshot. Employee edits may regenerate a new snapshot.

## Payment attestation (MVP)

No payment ledger is created. Optional fields `paymentConfirmedExternallyAt` / `paymentConfirmedExternallyByUserProfileId` record the employee attestation. Phase 3C Stripe should reuse `confirmPendingBooking` and replace this attestation with a processor-backed payment record.

## Deposit

`depositRequiredCents` is snapshotted from `Organization.depositPercent`. Do not hardcode 25 or 30 in generic engines.

TODO(Phase 3C): Confirm Generations deposit policy (public site 25% vs current tenant configuration) before Stripe.

## Payment / availability race

Two pending bookings may request the same slot. That is allowed. Only confirmation allocates. PostgreSQL overlap exclusion + location lock decide the winner. Payment recovery for a customer who pays but loses availability is a **Phase 3C blocking design requirement**. This phase does not pretend it is solved.

Employees can cancel a `PENDING_PAYMENT` booking that is stuck in **Payment received — availability conflict**. Cancellation does not invent a refund. The employee may also edit date/time/package, Check Availability, Save Pending Booking, and retry Confirm Payment & Book.

## Cancellation

`cancelBooking` requires `events.cancel`. It is transactional: location lock, validate cancellable state (`PENDING_PAYMENT` or `CONFIRMED`), set `Booking.status = CANCELLED` plus `cancelledAt` / `cancelledByUserProfileId`, set `Inquiry.salesStage = CLOSED`, and set `releasedAt` on every unreleased `ResourceReservation` for that booking (and leftover inquiry HOLDs). Reservation rows are kept. Composite and Full Facility occupancy release by booking relationship, not product names.

Pending cancellation has no occupancy to release. Confirmed cancellation must never leave active occupancy on a cancelled booking. `COMPLETED` cannot be cancelled.

Cancelled bookings leave Upcoming/Today/Week lists. They remain on Booking detail and appear under Past. Master Schedule occupancy is `releasedAt: null` only.

**Bookings confirmed before segment-level scheduling may retain their historical reservation windows. Cancel/recreate test bookings to validate the new allocator.** Do not backfill old confirmed rows from full-event windows to itinerary-segment windows.

## Development cleanup

Employee UI is enough. Do not SQL-delete test records:

1. Open the obsolete booking → Cancel Booking → confirm the Master Schedule is free
2. Open the inquiry → Archive Inquiry
3. For a payment-conflict pending booking: edit/retry, or Cancel Booking then Archive Inquiry

Archive does not cancel the booking.

## Legacy HOLD


The HOLD reservation enum remains. Existing rows stay readable. New customer Book Now and the normal employee path must not create HOLDs. Hold expiry / QStash-compatible expiry code remains for historical rows only.

## Fields

Tenant and location scoped. Pending rows may have null `confirmedBy` / `confirmedAt`. Payload JSON plus line items must be enough to finalize later without parsing chat.

## Out of scope (Phase 3C)

Stripe, payment links, webhooks, refunds, customer email, SMS.
