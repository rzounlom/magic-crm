# Communications (future outbound)

MagicCRM does not send customer email yet. There is no mail provider in this phase. Do not add a fake sender.

`CommunicationEvent` is the tenant-scoped outbound log. Status may be `SKIPPED` when a provider is missing — that is an audit row, not a send.

## Three customer states

Do not blur these. Each has different copy and different inventory meaning.

### State 1 — Inquiry submitted

The customer submitted the Personal Event Planner form. Recommendations may exist (`AWAITING_CUSTOMER`). Nothing is reserved.

A future “here are your plan options” email is separate from selection confirmation.

### State 2 — Customer selected a plan

`Inquiry.status = READY_FOR_HUMAN` with `humanHandoffReason = CUSTOMER_SELECTED_PLAN`. Staff copy: **CUSTOMER SELECTED PLAN — READY TO BOOK**.

This is strong intent, not a reservation. Finite resources are not HOLD/BOOKED.

Domain event: `event_plan.selected` → `onEventPlanSelected`.

Today the handler writes a `CommunicationEvent` (`kind = PLAN_SELECTION_CONFIRMATION`, `status = SKIPPED`, `skipReason = NO_EMAIL_PROVIDER`) and an audit row. When a provider exists, the same hook should send mail and update that row to `SENT` with `providerMessageId` / `sentAt`.

Suggested subject: `We received your {organizationName} event plan`.

Body must include customer/group, requested date, guest count, selected plan, activities, dining, estimated total, space, and that the event is **not** finalized. Suggested language:

> Thanks for choosing your event plan. We’ve saved your preferences and sent them to our event team. A {organizationName} event specialist will review availability and reach out soon to help finalize your event.

Do not say the event is booked.

### State 3 — Booking confirmed

A future Booking record is confirmed and finite resources are BOOKED.

This email is **not** triggered by inquiry selection. Domain event: `booking.confirmed` → `onBookingConfirmed({ bookingId })`.

Suggested subject: `Your {organizationName} Event Is Confirmed`.

Contents belong on the booking: confirmed date/time, guest count, activities, assigned resources, dining, pricing, deposit, arrival, waivers, change contact.

`onBookingConfirmed` is not called from production flows until Booking exists. If invoked without a booking id, the log uses `skipReason = NO_BOOKING_RECORD`.

## Why not one-off inquiry columns

`planSelectionConfirmationSentAt` on Inquiry would duplicate every later message kind. Use `CommunicationEvent` (and later a richer communications module) instead.
