# Communications (outbound)

Outbound customer email uses `CommunicationEvent` plus `createEmailProvider()`.

Provider modes (`EMAIL_PROVIDER`):
- `none` (default) — `SKIPPED` / `NO_EMAIL_PROVIDER`; no network send
- `console` — local/dev log only
- `resend` — Resend HTTP API when `RESEND_API_KEY` and `EMAIL_FROM` are set

`CommunicationEvent` is the tenant-scoped outbound log. Status may be `SKIPPED` when a provider is missing — that is an audit row, not a send. Real sending is never the default.

## Customer states

Do not blur these. Each has different copy and different inventory meaning.

### State 0 — Inquiry acknowledgment (automatic)

After a successful public WordPress Event Planner inquiry create, MagicCRM records/sends `INQUIRY_ACKNOWLEDGMENT`.

- Subject: `We received your event request`
- Confirms receipt only; includes organization business name
- Must not include prices, private calculation results, availability promises, booking claims, or payment links
- Must not invoke employee-approved quote delivery
- Idempotent per inquiry (`inquiry_acknowledgment:{inquiryId}`)
- Atomic claim: insert `CommunicationEvent` before provider send; partial unique index prevents concurrent double-sends
- Existing `SKIPPED` rows are **not** backfilled when email is later activated
- Email failure must not invalidate the inquiry submission

### State 1 — Inquiry submitted / staff quote path

The customer submitted the Personal Event Planner form. Staff may prepare a quote draft. Nothing is reserved by acknowledgment alone.

Customer quote delivery remains gated by pricing verification (`approved_plugin_baseline` / `plugin_defaults` blocked; `tenant_live` + verified readiness eligible). Quote email uses `EMPLOYEE_APPROVED_QUOTE` and is separate from acknowledgment.

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

A `Booking` record is confirmed (`status = CONFIRMED`) and associated finite resources are BOOKED.

This email is **not** triggered by inquiry selection. Domain event: `booking.confirmed` → `onBookingConfirmed`. Confirm Booking emits it only after the conversion transaction commits.

Suggested subject: `Your {organizationName} Event Is Confirmed`.

Contents belong on the booking: confirmed date/time, guest count, activities, assigned resources, dining, pricing, deposit, arrival, waivers, change contact.

If invoked without a booking id, the log uses `skipReason = NO_BOOKING_RECORD`. With a booking id and no mailer, the log uses `NO_EMAIL_PROVIDER` / `SKIPPED`. That is not a send.

## Why not one-off inquiry columns

`planSelectionConfirmationSentAt` on Inquiry would duplicate every later message kind. Use `CommunicationEvent` (and later a richer communications module) instead.
