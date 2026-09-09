# Inquiries (Phase 3A)

Inquiry is the CRM lead / event-sales anchor. Public customers complete a structured **Personal Event Planner** form. The same Inquiry remains throughout sales. After **Confirm Booking**, a distinct `Booking` record becomes the operational source of truth. This phase does not implement payments or outbound email delivery.

See also [`resource-schedule.md`](./resource-schedule.md) (shared finite-resource availability) and [`communications.md`](./communications.md) (plan-selection vs booking-confirmed emails).

## Public intake

Route: `/inquire/[organizationSlug]`

Public customer routes (`/inquire/*`, `/plan/*`, `/conversation/*`) each wrap `PublicCustomerShell` in their App Router layout. They do not reuse `EmployeeShell` or the marketing `SiteShell`. The customer header is brand-only — no employee sign-in, Clerk `UserButton`, `OrganizationSwitcher`, or `/app` navigation. Employee sign-in stays on the MagicCRM landing page.

Customer-facing title is `{organizationName} Personal Event Planner`. Do not special-case a tenant name in application code.

The slug is resolved server-side. Only organizations with `onboardingStatus = ACTIVE` accept inquiries. Invalid or inactive slugs return 404. The form never accepts a browser-supplied `organizationId`. Attractions and dining options on the form come from that tenant’s active `SalesKnowledgeItem` rows. If the tenant has no food items, the form uses generic dining preference categories.

After a valid submit:

1. Create `Inquiry` (`NEW`, `source = WEB`) with planner fields (guest mix, duration, budget range in cents, goal, dining, space, attraction interest ids)
2. Create `Conversation` (`channel = WEB`) with a hashed public token (opaque continuation; not a customer chat UI)
3. Persist the intake as an inbound customer message for staff history
4. Run the recommendation engine against tenant sales knowledge (`generateRecommendations` → `buildEventPlans`)
5. Persist `EventPlanRecommendation` rows on the same inquiry
6. Set status `AWAITING_CUSTOMER` when plans exist, or `NEEDS_FOLLOW_UP` when none are feasible (`humanHandoffReason = NO_FEASIBLE_PLAN`)
7. Redirect to `/plan/{opaqueToken}`

No customer account is created. Recommendation email is deferred until a communications stack exists. `personalEventPlanNotification()` builds `{ to, customerName, organizationName, planUrl, eventDate }` for a future sender; nothing is mailed today. `/conversation/{token}` redirects to `/plan/{token}`.

## Recommendation engine

`generateRecommendations({ inquiry, knowledge, availabilityProvider?, resourceCatalog?, storedRequirements? })` is the injection point for live availability. Production passes `createResourceScheduleAvailabilityProvider`, which calls `checkResourceAvailability` — the same service live agents and future booking must use.

`availabilityValidated` is true only when every finite resource required by that plan has configured numbered inventory and no HOLD/BOOKED conflict. Until an Admin configures inventory (or if ratios are unknown), it stays `false`. Static published limits still apply in `buildEventPlans`. Recommendation generation and customer selection do not insert schedule rows.

The engine tries to produce three *useful* choices, not three packages for their own sake:

- **Budget Friendly** — lower-cost event that still covers the core goal
- **Best Fit** — strongest overall close (budget midpoint, selected attractions, dining/space fit); visually **RECOMMENDED**
- **Premium Experience** — additional activity, dining, space, or duration value from tenant knowledge

Hard facts come from `SalesKnowledgeItem` (names, `priceText`, min/max guests, published age notes). The engine does not invent prices, hours, lane counts, food products, or availability. Guest-count and published age/capacity notes skip or penalize impractical combinations; unknown capacity is not fabricated. Internal `payload.ranking` scores stay off the customer UI.

Customer notes and attraction checkboxes are ranking signals, not hard requirements, except published restrictions (age, min/max guests) which cannot be overridden.

If fewer than three valid options exist, persist what is feasible. If none exist, keep the inquiry and show the customer a staff-follow-up message.

## Customer continuation

`/plan/{token}` shows the generated cards. Opening the link sets `recommendationsViewedAt`. **Choose This Event Plan** stores `selectedEventPlanId` / `customerSelectedAt` on the same inquiry, sets `READY_FOR_HUMAN` with `humanHandoffReason = CUSTOMER_SELECTED_PLAN`, pauses conversational AI, and emits `event_plan.selected` (email is skipped until a provider exists). Inventory is not held or booked.

The token is the existing 32-byte public conversation token. Only the SHA-256 hash is stored.

## Employee UI

- `/app/inquiries` — `crm.inquiries.view`. **Ready for Live Agent** is the live-booking queue. Inquiries with `humanHandoffReason = CUSTOMER_SELECTED_PLAN` are listed first with **CUSTOMER SELECTED PLAN — READY TO BOOK**. Converted inquiries (`status = BOOKED`) leave that queue and appear under Bookings.
- `/app/inquiries/[id]` — same view permission. Customer-selected inquiries open the **Live Agent Booking Workspace** (original snapshot + Current Agent Version). After conversion the workspace shows **Converted to Booking** with a link to `/app/bookings/{id}`.
- `/app/bookings` and `/app/bookings/[id]` — `events.view`. Operational list and read-only detail for confirmed Bookings.
- Start Working records `assignedUserProfileId` / `assignedAt` and copies the selected plan into an `EventPlanRecommendation` row with `kind = AGENT_WORKING`. The customer-selected row is never overwritten.
- **Confirm Booking** requires `events.confirm` plus `crm.inquiries.manage`, Ready to Finalize, a Current Agent Version, and active unexpired HOLDs covering finite requirements. It is atomic: Booking + line items + HOLD→BOOKED + Inquiry `BOOKED` + audit, then `booking.confirmed`.
- Contact customer (mailto / copy phone and email) is available now. Proposal, deposit, and booking edits are not built.
- Internal notes use `Inquiry.employeeInternalNotes` and are never shown on `/plan/{token}`
- Take over / leftover conversation notes — `crm.inquiries.manage`

Front Desk does not receive inquiry permissions. Event Sales can view/manage inquiries, view the Master Schedule, and place/release permitted holds. They do not receive Admin Resource Configuration (`inventory.manage`). Administrators have all keys. `ai.manage` is required to create/edit sales knowledge (`/app/admin/ai/knowledge`).

Selected-plan copy: **CUSTOMER SELECTED PLAN — READY TO BOOK**. Staff should start from the chosen package rather than repeating discovery. Selection is not a reservation. **Confirm Booking** creates the Booking record from the Current Agent Version and converts HOLDs to BOOKED.

Workflow stays on `Inquiry.status = READY_FOR_HUMAN` until confirmation. Substatus is `workflowStage`: `READY_FOR_LIVE_AGENT` → `AGENT_WORKING` → `HOLD_PLACED` → `READY_TO_FINALIZE`. After confirmation, `Inquiry.status = BOOKED` and the Inquiry is sales history linked to Booking (`@@unique([organizationId, inquiryId])`).

## Status workflow

| Status | Meaning |
| --- | --- |
| `NEW` | Just created, before recommendations finish |
| `AI_ENGAGED` | Leftover conversational agent is handling (not the customer planner path) |
| `AWAITING_CUSTOMER` | Plans generated; waiting for the customer to choose |
| `NEEDS_FOLLOW_UP` | No feasible plan, or a team member should nudge |
| `READY_FOR_HUMAN` | Customer selected a plan, handoff, or employee takeover. Selection is not a reservation. |
| `DECLINED` | Reserved; no UI yet |
| `BOOKED` | Inquiry converted to a confirmed Booking. Remains as sales history. |

These are three different customer states: (1) inquiry submitted, (2) plan selected / ready to book, (3) booking confirmed. Staff queue copy for (2) is **CUSTOMER SELECTED PLAN — READY TO BOOK**. See [`communications.md`](./communications.md).

`READY_FOR_HUMAN` stays the status until confirmation. Distinguish *why* with `humanHandoffReason` codes (`CUSTOMER_SELECTED_PLAN`, `AVAILABILITY_NEEDS_ADJUSTMENT` for a future failed hold, `NO_FEASIBLE_PLAN`, `GENERATION_FAILED`, `STAFF_ASSISTANCE`, `MANUAL_ESCALATION`). Distinguish *where the live agent is* with `workflowStage`. Do not treat `READY_FOR_HUMAN`, plan selection, or Ready to Finalize as booked.

Persisted status enums stay as stored. Employee UI uses `formatInquiryStatus` / `formatInquiryEmployeeStatus` / `formatInquiryQueueLabel` / `formatReadyForHumanReason`. Do not show raw enum tokens.

## Date/time and phone presentation

`desiredDate` (`@db.Date`) and `desiredStartTime` (wall-clock `HH:mm`) are **event-local** values. Format them with `formatEventLocalDateTime` without converting them as UTC instants. A customer who chose September 11 at 7:00 PM must stay September 11 at 7:00 PM for employees.

`createdAt` / `updatedAt` (and planner timestamps) are UTC timestamps. Convert those with `formatOrganizationTimestamp` into `Organization.timezone` loaded from `RequestContext.organizationId`. Tenant A’s timezone must not format Tenant B’s inquiries.

Phone is stored as normalized 10-digit digits. Display with `formatPhoneDisplay` as `(555) 654-3333`. Malformed legacy values stay unchanged.

`budgetMin` / `budgetMax` / `estimatedTotalCents` are integer minor units.

## Live Agent Booking Workspace

Customer-selected inquiries open a staff workspace on the same Inquiry. The customer-selected `EventPlanRecommendation` (`kind = RECOMMENDATION`) remains the historical choice. Staff edits persist on a separate `AGENT_WORKING` row (`Inquiry.agentWorkingPlanId`). Saving a draft reprices from sales knowledge and re-runs `checkResourceAvailability`. Place / Update / Extend / Release Hold reuse `resource-hold-service` and never create `BOOKED` rows.

The Current Agent Version is the source for Confirm Booking (inquiry, date/time, guests, products, pricing, rotations, holds). The customer-selected recommendation stays immutable history. After confirmation the Booking is the operational record; the working draft is not edited further.

## Next

Catalog, proposals, deposits, booking edits/reschedule, cancellation, and email delivery remain later phases.

Related employee-shell follow-up (not this inbox): sticky authenticated header. See `ui-conventions.md`.

## Channel abstraction

`Inquiry.source` and `Conversation.channel` already include `WEB`, `EMAIL`, and `SMS`. Only WEB is implemented. One inquiry may have multiple conversations later. The public token currently lives on the WEB conversation.

## Failure behavior

If recommendations cannot be generated, the inquiry remains. The customer sees a finishing-touches message. Status may become `NEEDS_FOLLOW_UP` with `NO_FEASIBLE_PLAN` or `GENERATION_FAILED`. Plan selection never books inventory.

The leftover Event Assistant (`SalesAgentService`) is not the customer-facing planner. It may still run if an employee resumes AI on a conversation.

## AI enablement vs entitlement

`aiHandlingEnabled` and `OPENAI_API_KEY` are operational. They are not a paid plan. Future entitlement billing must not be inferred from these flags.
