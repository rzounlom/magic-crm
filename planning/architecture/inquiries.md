# Inquiries (Phase 3A)

Inquiry is the CRM lead / event-sales anchor. Public customers now complete a structured **Personal Event Planner** form. The inquiry remains the primary record. This phase does not implement proposals, booking, payments, email delivery of plans, or live inventory reservation.

See also [`resource-schedule.md`](./resource-schedule.md) (shared finite-resource availability) and [`communications.md`](./communications.md) (future plan-selection vs booking-confirmed emails).

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

- `/app/inquiries` — `crm.inquiries.view`, with a **CUSTOMER SELECTED PLAN — READY TO BOOK** section for selected plans
- `/app/inquiries/[id]` — same view permission; shows planner answers, funnel timestamps, and the selected plan without reopening `/plan/{token}`
- Contact customer (mailto) is available now. Proposal, deposit, and convert-to-booking actions are not built
- Take over / leftover conversation notes — `crm.inquiries.manage`

Front Desk does not receive inquiry permissions. Event Sales can view/manage inquiries and view AI knowledge. Administrators have all keys. `ai.manage` is required to create/edit sales knowledge (`/app/admin/ai/knowledge`).

Selected-plan copy: **CUSTOMER SELECTED PLAN — READY TO BOOK**. Staff should start from the chosen package rather than repeating discovery. Selection is not a reservation.

## Status workflow

| Status | Meaning |
| --- | --- |
| `NEW` | Just created, before recommendations finish |
| `AI_ENGAGED` | Leftover conversational agent is handling (not the customer planner path) |
| `AWAITING_CUSTOMER` | Plans generated; waiting for the customer to choose |
| `NEEDS_FOLLOW_UP` | No feasible plan, or a team member should nudge |
| `READY_FOR_HUMAN` | Customer selected a plan, handoff, or employee takeover. Selection is not a reservation. |
| `DECLINED` | Reserved; no UI yet |
| `BOOKED` | Reserved for the future Booking engine; unused. Confirmed booking is a later record, not this inquiry status. |

These are three different customer states: (1) inquiry submitted, (2) plan selected / ready to book, (3) booking confirmed. Staff queue copy for (2) is **CUSTOMER SELECTED PLAN — READY TO BOOK**. See [`communications.md`](./communications.md).

`READY_FOR_HUMAN` stays the status. Distinguish *why* with `humanHandoffReason` codes (`CUSTOMER_SELECTED_PLAN`, `AVAILABILITY_NEEDS_ADJUSTMENT` for a future failed hold, `NO_FEASIBLE_PLAN`, `GENERATION_FAILED`, `STAFF_ASSISTANCE`, `MANUAL_ESCALATION`). Do not treat `READY_FOR_HUMAN` or plan selection as booked.

Persisted status enums stay as stored. Employee UI uses `formatInquiryStatus` / `formatInquiryEmployeeStatus` / `formatInquiryQueueLabel` / `formatReadyForHumanReason`. Do not show raw enum tokens.

## Date/time and phone presentation

`desiredDate` (`@db.Date`) and `desiredStartTime` (wall-clock `HH:mm`) are **event-local** values. Format them with `formatEventLocalDateTime` without converting them as UTC instants. A customer who chose September 11 at 7:00 PM must stay September 11 at 7:00 PM for employees.

`createdAt` / `updatedAt` (and planner timestamps) are UTC timestamps. Convert those with `formatOrganizationTimestamp` into `Organization.timezone` loaded from `RequestContext.organizationId`. Tenant A’s timezone must not format Tenant B’s inquiries.

Phone is stored as normalized 10-digit digits. Display with `formatPhoneDisplay` as `(555) 654-3333`. Malformed legacy values stay unchanged.

`budgetMin` / `budgetMax` / `estimatedTotalCents` are integer minor units.

## Next: Employee Inquiry Workspace MVP

The current `/app/inquiries` list and `/app/inquiries/[id]` record are a minimal inbox plus selected-plan queue. The next product step is an Employee Inquiry Workspace (assignment, filtering, richer pipeline). Catalog, Booking, proposals, deposits, plan email, and the staff Resource Schedule UI remain later phases.

Related employee-shell follow-up (not this inbox): sticky authenticated header. See `ui-conventions.md`.

## Channel abstraction

`Inquiry.source` and `Conversation.channel` already include `WEB`, `EMAIL`, and `SMS`. Only WEB is implemented. One inquiry may have multiple conversations later. The public token currently lives on the WEB conversation.

## Failure behavior

If recommendations cannot be generated, the inquiry remains. The customer sees a finishing-touches message. Status may become `NEEDS_FOLLOW_UP` with `NO_FEASIBLE_PLAN` or `GENERATION_FAILED`. Plan selection never books inventory.

The leftover Event Assistant (`SalesAgentService`) is not the customer-facing planner. It may still run if an employee resumes AI on a conversation.

## AI enablement vs entitlement

`aiHandlingEnabled` and `OPENAI_API_KEY` are operational. They are not a paid plan. Future entitlement billing must not be inferred from these flags.
