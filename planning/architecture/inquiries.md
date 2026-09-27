# Inquiries (Phase 3A)

Inquiry is the CRM lead / event-sales anchor. Public customers complete a structured **Personal Event Planner** form. The same Inquiry remains throughout sales. **Book Now** creates a pending unpaid `Booking`. **Confirm Payment & Book** (and future Stripe) allocates BOOKED resources. This phase does not implement payments or outbound email delivery.

**Pending bookings do not block inventory. Physical resources become unavailable only when a booking is confirmed after payment.**

See also [`resource-schedule.md`](./resource-schedule.md) (shared finite-resource availability) and [`communications.md`](./communications.md) (plan-selection vs booking-confirmed emails).

## Public intake

Route: `/inquire/[organizationSlug]`

Public customer routes (`/inquire/*`, `/plan/*`, `/conversation/*`) each wrap `PublicCustomerShell` in their App Router layout. They do not reuse `EmployeeShell` or the marketing `SiteShell`. The customer header is brand-only — no employee sign-in, Clerk `UserButton`, `OrganizationSwitcher`, or `/app` navigation. Employee sign-in stays on the MagicCRM landing page.

Customer-facing title is `{organizationName} Personal Event Planner`. Do not special-case a tenant name in application code.

The slug is resolved server-side. Only organizations with `onboardingStatus = ACTIVE` accept inquiries. Invalid or inactive slugs return 404. The form never accepts a browser-supplied `organizationId`, `locationId`, price, deposit, or resource quantity. Location is the organization's primary location.

The customer walks a short planner. Answers stay in the browser until the last step. Back and Edit keep the other answers. There is no server draft and no inquiry until **Build my event options**.

1. Event type — shared `EVENT_TYPE_OPTIONS` until a tenant event-type catalog exists. Do not branch on a tenant name.
2. Group size — whole number of guests, bounded by `PUBLIC_INTAKE_LIMITS.guestCount`.
3. Group mix — Mostly Kids / Youth, Mostly Adults, or Mix of Kids & Adults. Stored as the existing `guestMix` values `mostly_children`, `mostly_adults`, and `mixed_ages`, which already map to `KIDS_YOUTH`, `ADULTS`, and `MIXED`.
4. Attractions — multi-select cards for that tenant's active `AttractionInterest` rows (a customer-facing concept such as bowling, not a duration SKU). Each interest maps to one or more catalog products. If the tenant has no active interests, active attraction products are the fallback, then sales-knowledge attractions. Rooms, catering, packages, cards, and duration variants are not choices unless the tenant maps them behind an interest. Zero selections are allowed and mean "recommend from the tenant profile." Selected ids are preferences, not held inventory. Inactive interests and another tenant's ids are rejected. New submissions store interest ids. Older inquiries may still store Product or sales-knowledge ids; employee detail resolves whichever kind is stored.
5. Food — Yes / No, stored as `diningPreference` `WANTS_FOOD` or `NO_FOOD`. The customer does not pick a catering SKU.
6. Private space — Yes / No preference, stored as `spacePreference` `private` or `no_preference`. The customer does not pick a room.
7. Budget — total event ranges from `BUDGET_BAND_VALUES` (`Under $1,500` through `$7,500+`) plus Flexible / show me options. The band writes `budgetMin` / `budgetMax` in cents. It is recommendation guidance, not a quote, a cap, or a price override. Flexible leaves those cents null and stores `budgetPreference = FLEXIBLE`.
8. Date and preferred start time — 12-hour controls. Stored as a date plus `HH:mm` in the location's event-local clock.
9. Review, contact details, then **Build my event options**.

There is no dedicated beverage question. `beveragePreference` stays on older rows and still displays for staff. New submissions leave it null. Beverages can return later as package inclusions or catalog add-ons.

Attraction names that include a duration are formatted for display only (`60 Minutes` → `1 hour`, `90 Minutes` → `90 minutes`). Stored product names and `durationMinutes` do not change.

The planner is a viewport shell: context and the step question stay put, the answer region scrolls, and Back / Continue / Build my event options stay in a footer. **Build my event options** covers the page with “Creating your event options…” until the request finishes or fails.

The customer is not asked for a duration. `desiredDurationMinutes` stays null on new inquiries. Older inquiries that have it still display it.

Canonical fields the server persists: `eventType`, `guestCount`, `guestMix` (audience), `attractionInterestIds`, `diningPreference` (food), `beveragePreference`, `budgetPreference` (plus derived `budgetMin` / `budgetMax` cents for the current engine), `desiredDate`, `desiredStartTime`, `spacePreference`. `eventGoal` is set from the event type when the customer does not send a separate goal, so older goal-based ranking still has a signal.

After a valid submit:

1. Create `Inquiry` (`NEW`, `source = WEB`) with the canonical planner fields and the tenant's primary `locationId` (resolved from the public slug, never from a browser `organizationId`)
2. Create `Conversation` (`channel = WEB`) with a hashed public token (opaque continuation; not a customer chat UI)
3. Persist the intake as an inbound customer message for staff history
4. Run the recommendation engine against tenant sales knowledge (`generateRecommendations` → `buildEventPlans`)
5. Persist `EventPlanRecommendation` rows on the same inquiry
6. Set status `AWAITING_CUSTOMER` when plans exist, or `NEEDS_FOLLOW_UP` when none are feasible (`humanHandoffReason = NO_FEASIBLE_PLAN`)
7. Redirect to `/plan/{opaqueToken}`

No customer account is created. Recommendation email is deferred until a communications stack exists. `personalEventPlanNotification()` builds `{ to, customerName, organizationName, planUrl, eventDate }` for a future sender; nothing is mailed today. `/conversation/{token}` redirects to `/plan/{token}`.

## Recommendation engine

`generateRecommendations({ inquiry, knowledge, availabilityProvider?, resourceCatalog?, storedRequirements? })` is the injection point for live availability on the knowledge path. When the tenant has a catalog, `buildCatalogEventPlans` prices from `Product` / `ProductPrice` instead of `priceText`. Production always passes `createResourceScheduleAvailabilityProvider`, which calls `checkResourceAvailability` — the same service live agents and booking must use.

`availabilityValidated` is true only when every finite resource required by that plan has configured numbered inventory and no HOLD/BOOKED conflict. Until an Admin configures inventory (or if ratios are unknown), it stays `false`. Static published limits still apply in `buildEventPlans`. Recommendation generation and customer selection do not insert schedule rows.

The engine tries to produce three *useful* choices, not three packages for their own sake. Internal tiers stay `budget` / `best_fit` / `premium`. **Public labels** are Good / Recommended / Premium:

- **Good** — lower-cost event that still covers the core goal
- **Recommended** — strongest overall close (budget midpoint, selected attractions, dining/space fit); visually **RECOMMENDED**
- **Premium** — additional activity, dining, space, or duration value from tenant knowledge or catalog

Hard facts come from `SalesKnowledgeItem` (names, `priceText`, min/max guests, published age notes). The engine does not invent prices, hours, lane counts, food products, or availability. Guest-count and published age/capacity notes skip or penalize impractical combinations; unknown capacity is not fabricated. Internal `payload.ranking` scores stay off the customer UI.

Customer notes and attraction checkboxes are ranking signals, not hard requirements, except published restrictions (age, min/max guests) which cannot be overridden.

If fewer than three valid options exist, persist what is feasible. If none exist, keep the inquiry and show the customer a staff-follow-up message.

## Customer continuation

`/plan/{token}` shows the generated cards. Opening the link sets `recommendationsViewedAt`. **Book Now** creates one pending unpaid Booking (`DEPOSIT_PENDING`) from the selected snapshot and does not occupy inventory. **Submit inquiry** sets `READY_FOR_HUMAN` with `humanHandoffReason = CUSTOMER_SELECTED_PLAN`, pauses conversational AI, and does not create a Booking. Email is skipped until a provider exists.

The token is the existing 32-byte public conversation token. Only the SHA-256 hash is stored.

## Employee UI

- `/app/inquiries` — `crm.inquiries.view`. Default **Active** list is `archivedAt = null`. **Archived** (`?view=archived`) is newest-first. **Pending payment** is grouped above **Ready for Live Agent**. Converted inquiries (`status = BOOKED`) leave that queue and appear under Bookings.
- `/app/inquiries/[id]` — same view permission. Opens the employee booking workspace (original customer selection + working booking plan, or booked plan after confirmation). Pending bookings stay editable until confirmation. Archive / Unarchive require `crm.inquiries.manage` and do not cancel bookings. If a pending or confirmed booking still exists, the archive dialog warns and links to it.
- `/app/bookings` and `/app/bookings/[id]` — `events.view`. Includes a Pending payment filter. Confirmed records are read-only. **New Booking** (`/app/bookings/new`, `events.create` + `crm.inquiries.manage`) creates an Inquiry with `source = EMPLOYEE`, no public conversation, and generates plans with the same engine.
- Start Working records `assignedUserProfileId` / `assignedAt` and copies the selected plan into an `EventPlanRecommendation` row with `kind = AGENT_WORKING`. The customer-selected row is never overwritten. Pricing-affecting edits recalculate on the server.
- **Check Availability** requires inquiry manage permission. It does not insert occupancy. Conflicts show an inline panel with selectable nearby starts; they do not auto-change the working plan.
- **Save Pending Booking** persists unpaid commercial intent without occupancy.
- **Confirm Payment & Book** requires `events.confirm` plus `crm.inquiries.manage`. `crm.inquiries.view` cannot confirm. It calls `confirmPendingBooking` (atomic BOOKED allocation **per itinerary segment**). Confirm loads live DB state and does not fail solely because Check Availability bumped a plan row. Ready to Finalize and Place Hold are not required for new records.
- **Cancel Booking** requires `events.cancel`. See [`booking.md`](./booking.md).
- Inquiry list is newest `createdAt` first, with `id` DESC as a tie-break. Archived inquiries are excluded unless **Archived** is selected.
- Contact customer (mailto / copy phone and email) is available now. Proposal, deposit, and booking edits are not built.
- Internal notes use `Inquiry.employeeInternalNotes` and are never shown on `/plan/{token}`
- Take over / leftover conversation notes — `crm.inquiries.manage`

Front Desk does not receive inquiry permissions. Event Sales can view/manage inquiries, view the Master Schedule, and place/release permitted holds. They do not receive Admin Resource Configuration (`inventory.manage`). Administrators have all keys. `ai.manage` is required to create/edit sales knowledge (`/app/admin/ai/knowledge`).

Selected-plan copy: **CUSTOMER SELECTED PLAN — READY TO BOOK** for Submit inquiry. Book Now uses **Pending payment**. Selection is not a reservation.

Workflow stays on `Inquiry.status = READY_FOR_HUMAN` until confirmation. Substatus is `workflowStage`: `READY_FOR_LIVE_AGENT` → `AGENT_WORKING` → optional legacy `HOLD_PLACED` / `READY_TO_FINALIZE`. Commercial lifecycle is `salesStage`: `INQUIRY` → `PROPOSAL_READY` → `READY_TO_BOOK` (Submit inquiry) → `DEPOSIT_PENDING` (Book Now) → `BOOKED`. Cancellation sets `CLOSED`. Legacy `HOLD_PLACED` remains readable. Archive is `archivedAt` / `archivedByUserProfileId`, not a business status. Unarchive clears those fields and returns the inquiry to Active based on its persisted status. Conversation and customer data are kept.

Employee booking UI:

- New Booking (no public inquiry): enter details → Generate plan → Check Availability → Save Pending and/or Confirm Payment & Book
- Pending booking: Review/Edit → Check Availability → Confirm Payment & Book
- Live-agent inquiry: Review/Edit → Check Availability → save pending if needed → Confirm Payment & Book after external payment

`READY_TO_FINALIZE` remains persisted for older rows. It is not a required gate. Place Hold is not part of the new flow.

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

`createdAt` / `updatedAt` (and planner timestamps) are UTC timestamps. Convert those with `formatOrganizationTimestamp` using `resolveTenantTimezone`: a valid Location timezone first, else `Organization.timezone`, else UTC. Location.timezone is required on the schema, so a valid location zone wins over a later organization-only update. Invalid values such as the literal `IANA` log a config warning and fall back. Do not use the browser timezone. Tenant A’s timezone must not format Tenant B’s inquiries.

Phone is stored as normalized 10-digit digits. Display with `formatPhoneDisplay` as `(555) 654-3333`. Malformed legacy values stay unchanged.

`budgetMin` / `budgetMax` / `estimatedTotalCents` are integer minor units.

## Live Agent Booking Workspace

Customer-selected inquiries open a staff workspace on the same Inquiry. The customer-selected `EventPlanRecommendation` (`kind = RECOMMENDATION`) remains the historical choice. Staff edits persist on a separate `AGENT_WORKING` row (`Inquiry.agentWorkingPlanId`). Saving a draft reprices from catalog/sales knowledge and re-runs `checkResourceAvailability`. If a pending Booking already exists, the same save updates that booking in place. Check Availability does not insert occupancy. Confirm Payment & Book calls `confirmPendingBooking` and does not require Place Hold.

The working booking plan is the source for confirmation (inquiry, date/time, guests, products, pricing, rotations). The original customer selection stays immutable history. After confirmation the Booking is the operational record and is shown as **Booked plan**; the working draft is not edited further. Allocated resources come from that booking’s BOOKED `ResourceReservation` rows. Legacy HOLD rows remain releasable until they expire or convert, and are labeled only when those HOLD rows actually exist.

**Start Working** assigns the current employee and copies the selected plan into `AGENT_WORKING`. It does not alter the customer snapshot, create occupancy, or change price.

The customer-selected Book Now flow does not show generic Switch Package. Staff change guest count, time, activities, dining, or room on the working plan; the server recalculates.

## Employee inquiry awareness

Public inquiry creation writes the inquiry and returns. It does not wait for an employee session, and it does not enqueue a notification job.

While the authenticated employee app is open, the header polls `getInquiryAwareness` about every 15 seconds. The poll pauses while the browser tab is hidden and runs again when the tab becomes visible. One in-flight request is allowed. A failed poll is ignored and retried on the next interval.

The request uses `RequestContext`. The browser never supplies `organizationId`. The employee needs `crm.inquiries.view`. The response is the unread count plus a short recent list (name, guest count, event goal, time). It is not the inquiry detail payload.

`InquirySeen` is one row per employee per inquiry they have opened. Opening `/app/inquiries` does not create rows. Any visit to that inquiry’s detail page does, including the queue, the bell, and a direct URL. Opening inquiry B does not mark a newer inquiry C seen. Mark all as read inserts seen rows for the current employee’s active inquiries in the current organization only. Another employee keeps their own rows. Seen state survives reload and a later sign-in.

The bell shows that unread count and updates from the snapshot returned by a seen write, without waiting for the next poll. A poll that started before that write cannot paint the badge unread again. A toast fires only for inquiries that arrive after the first poll in the current browser session. Marking inquiries read does not toast. The inquiry list refreshes in place when a newer inquiry appears; the employee is not navigated away.

This contract is a snapshot (`unreadCount`, recent notification items, newest inquiry id/time). Polling is the current transport. A later SSE, WebSocket, or managed realtime channel can replace the timer without rewriting the bell, as long as it delivers the same snapshot and the same per-employee seen model.

Notifications in this phase are new inquiries only. The item `kind` is `inquiry.created` so another kind can be added later. There is no email, SMS, browser Notification API, sound, or preference center.

## Start over

A text **Start over** control is available on the planner. It is not the primary action. Confirmation uses the shared dialog, not `window.confirm`.

- Title: Start over?
- Body: Your current plan will be discarded and you'll return to the beginning.
- Actions: Cancel, Start over

Confirming clears the in-browser answers and returns to step 1. The planner does not keep a server draft, and the inquiry is created only when the customer builds options, so Start over does not delete CRM history and cannot release a reservation that was never created.

## Active queue and ended events

The Active list is inquiries with `archivedAt` null whose confirmed or completed booking has not ended. The end is `Booking.endsAt` compared to server time. An end equal to now is already historical. A future `endsAt` stays Active even if the inquiry is old.

Cancelled and pending-payment bookings stay Active. They are not “the event is over.” An inquiry with no booking stays Active until someone archives it.

Rows confirmed before `endsAt` existed fall back to the event calendar date being strictly before today in the organization timezone. A same-day legacy row with no `endsAt` stays Active.

The Archived view is manual archives plus those ended confirmed/completed bookings. The query does this. Nothing is deleted, and no job flips `archivedAt`. Restoring a manually archived inquiry returns it to Active unless the confirmed event has already ended.

## Backward compatibility

Older inquiries keep their stored dining key or product slug, event-total budget cents, per-guest `budgetPreference`, `beveragePreference`, `semi_private` space value, guest mix including `teens`, and `desiredDurationMinutes`. Employee inquiry detail renders those values. New rows use total-event budget bands and do not ask about beverages. Nothing rewrites old rows to look new.

The current proposal engine is unchanged aside from a read adapter: `WANTS_FOOD` → `not_sure`, `NO_FOOD` → `none`. The next phase replaces that adapter with tenant food tiers, budget-aware Good / Recommended / Premium, room selection, and beverage recommendations. Do not implement those rules in the intake UI.

## Next

See [`catalog.md`](./catalog.md), [`proposal-engine.md`](./proposal-engine.md), [`resource-schedule.md`](./resource-schedule.md), and [`booking.md`](./booking.md). Phase 3A catalog-backed proposals are complete. Phase 3A.5 location/tenant hardening is complete. Phase 3B transactional occupancy is complete. **Phase 3B.4** is segment-level scheduling, availability-aware proposals, and employee New Booking. **Phase 3B.4a** is booking cancellation and inquiry archive (no hard-delete). **Phase 3B.4b** is employee workspace truth (original / working / confirmed / allocated / legacy HOLD). Public intake phase 1 is the guided planner and canonical preferences. Next: recommendation composition for food tiers, budget-aware options, room selection, and beverages. Phase 3C is Stripe and email.

Related employee-shell follow-up (not this inbox): sticky authenticated header. See `ui-conventions.md`.

## Channel abstraction

`Inquiry.source` and `Conversation.channel` already include `WEB`, `EMAIL`, and `SMS`. Employee-created records use `Inquiry.source = EMPLOYEE` and do not create a conversation. Only WEB is implemented for public customers. One inquiry may have multiple conversations later. The public token currently lives on the WEB conversation.

## Failure behavior

If recommendations cannot be generated, the inquiry remains. The customer sees a finishing-touches message. Status may become `NEEDS_FOLLOW_UP` with `NO_FEASIBLE_PLAN` or `GENERATION_FAILED`. Plan selection never books inventory.

The leftover Event Assistant (`SalesAgentService`) is not the customer-facing planner. It may still run if an employee resumes AI on a conversation.

## AI enablement vs entitlement

`aiHandlingEnabled` and `OPENAI_API_KEY` are operational. They are not a paid plan. Future entitlement billing must not be inferred from these flags.
