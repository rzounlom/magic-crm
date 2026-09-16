# Booking (Phase 3B)

A `Booking` is the confirmed operational record. Customer proposal acceptance does **not** create a Booking. It creates a 24-hour `ResourceReservation` HOLD. Staff Confirm Booking, and the future Phase 3C payment webhook, call the same conversion: `confirmHeldBooking` / `confirmInquiryBooking`.

## Status

| Status | Meaning |
| --- | --- |
| `CONFIRMED` | Staff (or future payment webhook) converted holds or allocated BOOKED rows |
| `CANCELLED` | Reserved for a later cancellation workflow |
| `COMPLETED` | Reserved for post-event |

Do not add `PENDING_DEPOSIT` Booking rows in this phase. Deposit-pending is an Inquiry `salesStage` / HOLD semantics until Stripe exists.

## Fields

Tenant and location scoped. Composite FKs keep Inquiry and Location in the same organization.

- Event-local `eventDate` + `startTime`/`endTime`/`startMinute`/`endMinute` (same occupancy model as reservations)
- UTC `startsAt` / `endsAt` converted with location timezone, else organization timezone
- `subtotalCents` / `totalCents` integer cents from the working (or selected) proposal snapshot
- `depositRequiredCents` from `Organization.depositPercent` at confirmation time
- `depositPaidCents` stays 0 until Phase 3C
- Customer snapshot fields copied from Inquiry

A Booking must never reference another tenant's Inquiry, proposal, or resources.

## Conversion

`confirmHeldBooking` is the reusable domain entry:

1. Load Inquiry in RequestContext organization
2. Recheck availability
3. If active covering HOLDs exist, convert those exact rows to BOOKED in the same transaction (`expiresAt` cleared). Do not release then reacquire.
4. If no HOLD exists, assign exact physical resources and insert BOOKED rows in the same transaction as the Booking
5. If a hold expired before convert (`updateMany` count 0), allocate fresh availability rather than revive the stale HOLD
6. Partial convert rolls back. Conflict = cannot book. No force-double-book.

Inquiry `salesStage` / `status` become `BOOKED`.

Held proposal employee path: Start Working → review → Confirm Booking. Live-agent / no-hold path: Start Working → Place Hold → Confirm Booking. `READY_TO_FINALIZE` is not required.

Event-local wall-clock values (preferred date/time, itinerary) are formatted without UTC conversion. Reservation/Booking `startsAt`/`endsAt` and hold expiry are real instants formatted with the location IANA timezone if valid, else the organization timezone, else UTC. The literal string `IANA` is invalid configuration.

## Deposit policy

`Organization.depositPercent` (0–100, default 30) is tenant configuration. Proposal snapshots store `depositPreviewCents` and `depositPreviewPercent` from that policy. Engines must not hardcode 30% except as the invalid-config fallback.

## Out of scope (Phase 3C)

Stripe, payment links, webhooks, transactional email, SMS, refunds, cancellation fees.
