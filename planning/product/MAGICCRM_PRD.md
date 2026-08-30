# MagicCRM
## Product Requirements Document & Phased Delivery Plan

**Working name:** MagicCRM  
**Product type:** Booking, Event CRM, POS, Intake & AI-assisted sales platform  
**Primary users:** Attraction/family-entertainment facility staff, event sales staff, front desk employees, managers, customers and prospective customers  
**Initial deployment:** Single facility, architected for multi-location / multi-organization expansion  
**Primary stack:** Next.js App Router, TypeScript, Prisma, Neon Postgres, Clerk, Stripe, OpenAI API, optional Upstash QStash, Vercel  
**Document goal:** Be the implementation source of truth for development in Cursor.

---

# 1. Product Vision

MagicCRM should be one simple operating system for the customer journey from initial interest through payment and event execution.

A prospective customer should be able to submit an online inquiry, receive intelligent follow-up from an AI sales/response agent, ask questions about packages and attractions, receive a tailored recommendation or proposal, approve it, pay a deposit, receive confirmations/reminders/waiver links, and attend the event.

An employee should be able to see every lead that requires attention, see what the AI has discussed, take over when necessary, build or edit an event proposal, book inventory without double-booking, take deposits/balances/POS payments, see proposed and confirmed events on a calendar, track waivers/notes/balances, search customer history, and understand sales conversion.

The design principle is:

> **AI handles inquiry qualification and routine selling. Humans handle exceptions, final booking decisions, and relationship-sensitive interactions.**

---

# 2. Core Product Principles

## 2.1 Simple by default

A first-time employee should be able to understand the main workflow without training. Every screen should make four things obvious: what is happening, what needs attention, what the next action is, and what is overdue or at risk.

Avoid dense enterprise-CRM layouts.

## 2.2 One source of truth

Customer, inquiry, proposal, event, inventory, payment, and communication state live in PostgreSQL. Stripe, OpenAI, email providers and calendars reference MagicCRM records; they are not the authoritative booking database.

## 2.3 AI never invents business facts

The AI may speak naturally and recommend options, but it must call MagicCRM application tools for prices, capacities, durations, waiver requirements, availability, deposits, policies, and booking state.

## 2.4 Proposed is not reserved

Initial event state model:

- `DRAFT` — internal only
- `PROPOSED` — saved but not sent
- `PROPOSAL_SENT` — actually delivered to the customer
- `CUSTOMER_APPROVED` — accepted but required payment is incomplete
- `CONFIRMED` — required payment completed and inventory committed
- `COMPLETED`
- `CANCELLED`
- `DECLINED`

A proposal may appear on the calendar but must not consume inventory unless an explicit temporary hold has been created.

## 2.5 Inventory is shared everywhere

Online booking, employee event builder, AI availability checks and POS use the same availability service.

Examples: bowling lanes, axe lanes, party rooms, laser-tag capacity and go-kart heat capacity.

## 2.6 Security is a feature

Every feature explicitly considers authentication, authorization, organization/location boundaries, PII, payment data, webhook authenticity, rate limiting, auditability, prompt injection, AI tool misuse and data retention.

---

# 3. Recommended Technical Architecture

## 3.1 Application

Use **Next.js App Router + TypeScript**.

- Server Components by default.
- Client Components only where browser interactivity is required.
- Route handlers for external webhooks/public API endpoints.
- Server Actions only where they simplify authenticated internal mutations.
- Zod validation at every trust boundary.
- Domain logic must not live inside React presentation components.

Recommended structure:

```text
src/
  app/
  components/
    ui/
    crm/
    booking/
    inventory/
    payments/
    ai/
  modules/
    customers/
    inquiries/
    catalog/
    availability/
    proposals/
    bookings/
    payments/
    communications/
    waivers/
    ai-sales/
  lib/
    db/
    auth/
    stripe/
    openai/
    qstash/
    email/
    observability/
  server/
    services/
    repositories/
    policies/
    jobs/
  tests/
```

## 3.2 Database

Use **Neon PostgreSQL + Prisma** as the authoritative transactional store.

Use Prisma for schema, migrations, typed access and transactions. Use database constraints in addition to application validation.

Availability must not rely on a UI-only check-then-insert. Final inventory reservation needs a concurrency-safe transaction strategy.

## 3.3 Authentication

Use **Clerk**.

Initial roles:

- `OWNER`
- `ADMIN`
- `EVENT_MANAGER`
- `SALES`
- `CASHIER`
- `VIEWER`

Every employee belongs to an `Organization`. Location-specific records also include `locationId`. Server-side policy functions own authorization rules.

## 3.4 Payments

Use **Stripe**.

Online:

- PaymentIntents / Checkout / Elements as appropriate.
- MagicCRM never stores raw card numbers.
- Stripe server/webhook state is authoritative for successful payment.

In store:

- Plan for Stripe Terminal readers.
- POS initiates a server-side payment and reader flow.
- Server/webhook confirmation closes the payment/order.

Future platform:

- Keep a payment provider abstraction.
- If MagicCRM becomes SaaS for third-party facilities, evaluate Stripe Connect.
- Do not add PayFac complexity to the first facility release.

## 3.5 AI Sales/Response Agent

Use **OpenAI Responses API + application-defined function tools**.

The model handles conversation, qualification, recommendations, objection handling, extraction/classification, summaries and next-best-action wording.

MagicCRM tools supply business facts/actions.

Initial tools:

```text
get_business_profile()
search_catalog(filters)
get_package(packageId)
get_attraction(attractionId)
check_availability(date, resourceNeeds)
estimate_event_price(input)
get_booking_policies()
get_waiver_requirements(attractionIds)
create_or_update_lead(...)
create_draft_proposal(...)
request_human_handoff(reason)
schedule_follow_up(...)
log_customer_preference(...)
```

The AI must NOT have tools that can independently mark an event confirmed, fabricate a payment, refund money, arbitrarily change pricing, override inventory or alter permissions.

## 3.6 Background jobs / eventing

**Do not use QStash as core application architecture initially.** Add it when delayed/retryable work is needed.

Good QStash uses:

- scheduled proposal follow-ups
- email retries
- event reminders
- waiver reminders
- abandoned AI conversation follow-up
- long-running asynchronous AI processing
- nightly CRM hygiene

Every async job must be idempotent.

---

# 4. Core Domain Model

## Organization / Location

### Organization
- id
- name
- slug
- timezone
- currency
- createdAt
- updatedAt

### Location
- id
- organizationId
- name
- address
- timezone
- active

### UserProfile
- id
- clerkUserId
- organizationId
- defaultLocationId
- role

## CRM

### Customer
- id
- organizationId
- type: INDIVIDUAL | GROUP
- firstName
- lastName
- organizationName
- email
- normalizedEmail
- phone
- normalizedPhone
- notes
- marketingConsent
- createdAt
- updatedAt

### Inquiry
- id
- organizationId
- locationId
- customerId
- source
- eventType
- requestedDate
- alternateDates
- estimatedGuests
- budgetRange
- interests
- notes
- status
- ownerUserId nullable
- nextAction
- nextActionAt
- aiManaged
- humanHandoffRequired
- lostReason nullable
- createdAt
- updatedAt

### InquiryTimelineEvent
Append-only:
- id
- inquiryId
- type
- actorType: USER | CUSTOMER | AI | SYSTEM
- actorId nullable
- metadata JSON
- createdAt

## Communications

### Conversation
- id
- inquiryId
- channel: EMAIL | SMS | WEB_CHAT
- status: AI_MANAGED | HUMAN_MANAGED | CLOSED
- aiSummary
- lastInboundAt
- lastOutboundAt

### Message
- id
- conversationId
- direction: INBOUND | OUTBOUND
- senderType
- subject nullable
- bodyText
- providerMessageId
- deliveryStatus
- aiGenerated
- approvedByUserId nullable
- createdAt

### FollowUpTask
- id
- inquiryId
- dueAt
- type
- status
- attempts
- completedAt

## Catalog

### CatalogItem
- id
- organizationId
- locationId nullable
- type: PACKAGE | ATTRACTION | FOOD | DRINK | FEE | DISCOUNT
- name
- description
- active
- basePrice
- taxCategory
- durationMinutes nullable
- minGuests nullable
- maxGuests nullable
- metadata

### PackageItem
Joins package to included items.

### BusinessPolicy
Key/value policy store for cancellation, deposits, outside food, age requirements and waiver rules.

## Inventory

### ResourcePool
- id
- locationId
- name
- capacity
- bookingIncrementMinutes
- bufferBeforeMinutes
- bufferAfterMinutes

### ResourceRule
Maps catalog/package requirements to resource pools.

### ResourceReservation
- id
- bookingId nullable
- proposalId nullable
- resourcePoolId
- startAt
- endAt
- quantity
- status: HOLD | CONFIRMED | CANCELLED
- expiresAt nullable

### ResourceBlock
- resourcePoolId
- startAt
- endAt
- quantity
- reason

Availability:

```text
available =
configured capacity
- overlapping confirmed reservations
- valid overlapping holds
- resource blocks
```

## Proposal / Booking

### Proposal
- id
- inquiryId
- customerId
- eventDate
- guestCount
- status
- subtotal
- discountTotal
- taxTotal
- total
- requiredDeposit
- expiresAt
- sentAt
- approvedAt
- notes
- version

### ProposalItem
- proposalId
- catalogItemId
- descriptionSnapshot
- unitPriceSnapshot
- quantity
- startAt nullable
- endAt nullable
- subtotal
- metadata

Pricing is snapshotted so old proposals do not change when catalog prices change.

### Booking
- id
- proposalId nullable
- customerId
- locationId
- status
- eventStart
- eventEnd
- total
- amountPaid
- balanceDue
- balanceDueAt
- notes

### BookingItem
Snapshot of confirmed event items.

## Payments

### Order
General financial ledger object.

### Payment
- orderId
- provider
- providerPaymentIntentId
- type: ONLINE | TERMINAL | CASH | OTHER
- amount
- status
- receivedAt

### Refund

### PaymentEvent
Auditable payment-provider lifecycle events.

## Waivers

### WaiverRequirement
Generated by booking items.

### WaiverParticipant
- bookingId
- name
- email
- signedAt
- waiverVersion
- providerReference nullable

Initial rules:
- Axe Throwing => waiver required
- Go-Kart Race => waiver required

---

# 5. AI Intake & Response Agent PRD

## 5.1 Initial customer channel

Start with **website inquiry form + email conversation**.

Future channels can include web chat, SMS and social messaging.

Website form fields:

- name
- email
- phone
- individual / organization
- event type
- estimated guests
- preferred date
- alternate date flexibility
- attractions of interest
- age range where relevant
- budget range optional
- special notes
- preferred contact method
- privacy/communication consent

Submission creates:

1. Customer (deduplicated)
2. Inquiry
3. Conversation
4. Timeline event
5. AI intake job/request

## 5.2 Agent objective

> Move qualified prospects toward a reservation while maintaining accuracy, customer trust and appropriate human escalation.

Secondary objectives:

- answer routine questions
- gather missing qualification data
- explain packages clearly
- recommend a manageable number of options
- create urgency only from truthful inventory/time constraints
- surface best-fit packages
- collect enough information for a useful proposal
- hand off at the right moment

Preferred response pattern:

1. Answer the customer’s immediate question.
2. Identify one useful missing fact.
3. Make one relevant recommendation.
4. Offer one concrete next step.

The agent should be helpful and sales-oriented, not pushy.

## 5.3 Conversation states

```text
NEW
QUALIFYING
RECOMMENDING
AVAILABILITY_DISCUSSION
PROPOSAL_READY
AWAITING_CUSTOMER_RESPONSE
HUMAN_HANDOFF
CLOSED_BOOKED
CLOSED_LOST
```

Application state is authoritative. AI may return structured classification suggestions.

## 5.4 Human handoff triggers

Mandatory handoff when:

- customer explicitly requests an employee
- customer is ready to finalize/book and business policy requires staff
- custom discount/exception is required
- event value/size exceeds configured threshold
- complaint or service recovery
- safety concern
- legal/waiver dispute
- payment dispute
- model confidence is low on a business fact
- conversation loops or customer frustration is detected
- a tool/API failure prevents an accurate answer
- customer asks for something outside approved knowledge scope

Employee handoff card includes:

- customer
- requested date
- guest count
- preferred attractions
- budget
- recommended package
- availability last checked
- questions/objections
- AI recommendation
- conversation summary
- suggested employee next action

## 5.5 Agent knowledge strategy

Do not hardcode the catalog in a giant prompt.

Use:

**Static system/developer prompt**
- brand voice
- behavioral rules
- sales philosophy
- escalation rules

**Structured MagicCRM tools**
- catalog
- pricing
- policies
- inventory
- customer/inquiry context

**Optional retrieval later**
- long FAQ
- detailed policies
- marketing descriptions

## 5.6 Prompt-injection controls

All customer text is untrusted.

The agent must never:

- reveal system instructions
- expose another customer’s information
- treat customer instructions as authorization
- execute arbitrary URLs/code
- trust a customer-stated price/availability as truth

All tools independently validate authorization, organization scope and arguments.

## 5.7 AI evaluations

Maintain versioned scenarios:

- birthday for 12
- teen party
- corporate group for 50
- youth/church group
- sold-out Saturday
- discount request
- prompt-injection attempt
- request to bypass waiver
- request for human
- frustrated customer
- unclear date
- age restriction conflict
- high-value custom event
- ready-to-pay lead

Score:

- factual accuracy
- correct tool use
- policy compliance
- handoff correctness
- recommendation quality
- tone
- progress toward booking
- hallucination rate

Prompt/model/tool changes must pass the evaluation suite before release.

---

# 6. UI / Design Requirements

MagicCRM should feel professional, warm and operationally efficient.

Recommended visual language:

- deep navy/slate foundation
- calm blue primary actions
- soft teal/green for success
- amber for attention/follow-up
- muted red only for destructive/overdue
- warm off-white/cool-gray backgrounds

Avoid rainbow entertainment UI, generic Bootstrap-style cards everywhere, excessive gradients, dense enterprise CRM tables, hidden critical actions and unlabeled icon-only actions.

Primary employee navigation:

```text
Home
Inquiries
Customers
Events
Calendar
POS
Operations
Communications
Reports
Admin
```

Home dashboard should emphasize:

```text
Needs attention
- new inquiries
- follow-ups due
- approved proposals awaiting deposit
- unpaid balances

Today's events
Upcoming events
AI conversations requiring human handoff
```

UX standards:

- autosave drafts where safe
- never discard event-builder state on save
- explicit saving/saved indicators
- destructive-action confirmation
- fast customer search
- keyboard-friendly employee flows
- touch-friendly POS
- useful empty states
- skeleton loading
- clear failure/retry messages
- organization-local timezone everywhere

---

# 7. Non-Functional Requirements

## Performance

- paginate CRM/customer history
- avoid N+1 queries
- bounded availability queries
- indexes for common filters
- keep long AI/email work off synchronous UI paths unless immediate output is necessary

## Reliability

- idempotent Stripe webhook handling
- idempotent email/background jobs
- retriable async work
- audit logs for important state transitions
- deliberate retention/soft-delete rules

## Observability

Implement:

- structured server logs
- correlation IDs
- error tracking
- Stripe webhook logs
- AI tool-call logs
- AI latency/token/cost metrics
- job status
- email delivery state

Never log raw card data or unnecessary PII.

---

# 8. Testing Strategy

Every feature requires tests.

## Unit tests

Use for pricing, deposit math, status transitions, waiver rules, next actions, availability overlap and AI decision helpers.

## Integration tests

Use a real test Postgres database for Prisma repositories, transactions, inventory reservations, webhook processing, proposal versioning and permission boundaries.

## End-to-end tests

Playwright critical journeys:

1. Website inquiry submitted.
2. Inquiry appears in CRM.
3. AI response is logged.
4. Staff builds proposal.
5. Saving proposal does not clear items.
6. Editing loads latest saved proposal.
7. CRM changes to Proposal Sent only after successful communication send.
8. Customer approves.
9. Deposit webhook confirms booking.
10. Inventory is reserved.
11. POS sees reduced inventory.
12. Waiver requirement appears for Axe / Go-Kart.
13. Cancellation releases inventory correctly.

## AI eval suite

Keep separate from deterministic tests. CI/release should block if critical safety/accuracy scores fall below threshold.

---

# 9. Security Requirements

Minimum:

- Clerk authentication on employee routes
- server-side RBAC
- organization/location scoping for every relevant query
- Zod validation
- webhook signature validation
- Stripe idempotency
- QStash signature validation if introduced
- public inquiry/chat rate limiting
- abuse/CAPTCHA strategy
- XSS-safe customer-content rendering
- secrets stay server-side
- audit privileged changes
- no raw card storage
- IDOR protections on every resource identifier
- AI tools independently enforce access policy
- privacy export/delete process
- tested backups/restore before production

---

# 10. Phased Delivery Plan

## Phase 0 — Foundation

### Goal
Create a development foundation that prevents architectural drift.

### Deliverables
- Next.js + TypeScript
- strict type checking
- Prisma + Neon
- Clerk
- environment validation
- lint/format
- CI
- Vitest
- Playwright
- error boundaries
- employee app shell
- design tokens
- architecture decision records
- seed strategy
- Cursor rules

### Exit criteria
- clean install works
- preview deployment works
- CI passes typecheck/lint/tests
- protected employee area works
- test database workflow is documented

---

## Phase 1 — Organization, Location, Auth & Employee Shell

### Goal
Secure internal application foundation.

Features:
- Organization
- Location
- UserProfile
- roles/permissions
- polished primary navigation
- basic dashboard
- server-side authorization policy service

Tests:
- unauthorized access
- cross-organization isolation
- role restrictions

---

## Phase 2 — Catalog & Admin Configuration

### Goal
Business offerings become configurable rather than hardcoded.

Features:
- packages
- attractions
- food/drinks
- pricing
- descriptions
- durations
- active/inactive
- waiver flags
- deposit defaults
- operating hours
- resource requirements

Initial seeded examples:
- Birthday packages
- Group packages
- Bowling — 30 minutes
- Axe Throwing — 1 hour
- Mini Golf
- Laser Tag — 1 game
- Go-Kart Race
- Chips
- Drinks

---

## Phase 3 — Shared Resource Inventory Engine

### Goal
One concurrency-safe availability service.

Features:
- resource pools
- capacity
- hours/schedules
- blocks
- before/after buffers
- availability search
- temporary-hold abstraction
- confirmed reservation

Critical invariant:

> If POS consumes bowling capacity, online/event-builder/AI availability immediately reflects that change.

Concurrency tests are mandatory.

---

## Phase 4 — Customers & CRM Intake

### Goal
Customer history and inquiry pipeline.

Features:
- customer deduplication
- customer search/history
- inquiry creation
- public online inquiry form
- CRM queue
- statuses
- next action
- follow-up date
- lost reason
- timeline
- employee notes

Status model:

```text
NEW_INQUIRY
BUILD_PROPOSAL
PROPOSAL_SENT
NEEDS_FOLLOW_UP
EVENT_BOOKED
DECLINED
```

Invariant:

> `PROPOSAL_SENT` cannot be set by a manual status toggle. It is caused by a successful proposal communication send result.

---

## Phase 5 — Event Builder & Proposal Engine

### Goal
Build custom events from packages and attractions.

Features:
- start from date/customer
- add birthday packages
- add group packages
- add attractions
- schedule inventory-backed items
- add food/add-ons
- notes
- itinerary
- totals
- deposit requirement
- balance due date
- save proposal
- edit latest proposal
- proposal versioning
- proposed calendar display

Invariant:

> Saving a proposal never clears the current event-builder contents.

---

## Phase 6 — Communications Foundation

### Goal
Send and track real messages.

Features:
- `EmailProvider` abstraction
- templating
- delivery log
- proposal email
- confirmation
- balance reminder
- event reminder
- waiver request
- manual resend
- delivery/error state

Only a successful provider send changes the inquiry to `PROPOSAL_SENT`.

---

## Phase 7 — AI Intake & Sales Agent

### Goal
AI handles routine qualification and selling until handoff is appropriate.

Features:
- AI-managed conversations
- application tools
- structured state classification
- catalog lookup
- availability lookup
- package recommendation
- qualification
- objection handling
- follow-up drafting
- CRM timeline logging
- human handoff
- employee conversation view
- AI summary

### Rollout

**Stage A:** AI drafts, employee approves send.  
**Stage B:** AI automatically sends explicitly low-risk replies.  
**Stage C:** AI runs configured follow-up sequences automatically.

Do not begin with full autonomy.

Metrics:
- inquiries handled before human touch
- inquiry-to-proposal conversion
- proposal-to-booking conversion
- handoff rate
- first-response time
- factual-error rate
- customer complaint/opt-out rate
- AI cost per inquiry

---

## Phase 8 — Customer Proposal Portal

### Goal
Secure mobile-friendly customer review/approval page.

Features:
- signed secure URL
- itinerary
- pricing
- terms
- deposit
- approve
- decline / request changes
- expiration

Never expose internal CRM notes.

---

## Phase 9 — Stripe Online Payments

### Goal
Confirm bookings through trusted payment state.

Features:
- Stripe customer mapping
- PaymentIntent
- deposits
- balance payments
- refunds
- signed webhook processing
- payment ledger
- receipts
- failure handling

Invariant:

> Browser redirects never confirm bookings. Server-side Stripe state/webhook processing does.

Successful required payment causes:
- booking confirmed
- inventory committed
- CRM -> Event Booked
- confirmation queued
- operations record created

---

## Phase 10 — Calendar, Operations & Waivers

Calendar:
- month/week/day
- proposed vs confirmed
- click date to build
- click event to edit
- filters

Operations:
- today's events
- preparation checklist
- event status
- notes
- balances

Waivers:
- generated from booking items
- Axe Throwing required
- Go-Kart Race required
- participant tracking
- reminder communication

---

## Phase 11 — POS

### Goal
Fast employee/front-desk selling using shared inventory.

Features:
- large touch-friendly catalog
- quick sale
- scheduled attraction picker
- customer attach/search
- cart
- tax
- payment abstraction
- receipts

Cash/manual tender requires permissions and audit trail.

---

## Phase 12 — Stripe Terminal

### Goal
Card-present payments from MagicCRM POS.

Implementation spike:
- choose supported reader
- register reader/location
- server creates payment intent
- POS initiates reader collection
- reader collects/processes
- trusted server/webhook confirms
- order closes

Keep hardware-specific behavior outside the core Order/Payment domain.

---

## Phase 13 — QStash / Scheduled Automation

Introduce only once the core app needs retryable/delayed jobs.

Jobs:
- proposal follow-up
- approved-but-unpaid deposit
- balance reminder
- event reminder
- waiver reminder
- abandoned AI conversation
- email retry

Requirements:
- verified signatures
- idempotency keys
- attempt tracking
- job log
- dead-letter handling

---

## Phase 14 — Reporting

Dashboards:
- inquiries
- response time
- proposals
- bookings
- conversion
- revenue
- average event value
- lead source
- decline reason
- AI-assisted conversion
- human takeover rate
- resource utilization
- outstanding balances

---

## Phase 15 — Multi-location / SaaS Hardening

Only after single-location stability.

- tenant onboarding
- per-location catalog
- permissions audit
- tenant isolation audit
- Stripe Connect evaluation
- MagicCRM subscription billing
- support tooling
- tenant-level AI behavior configuration
- exports

---

# 11. Cursor Development Workflow

Never ask Cursor to “build the CRM.” Give it one bounded feature.

For every task:

1. Inspect the existing code first.
2. State allowed scope.
3. State non-goals.
4. Require a plan before edits.
5. Require schema/API impact analysis.
6. Require security review.
7. Require tests.
8. Require risks/concerns output.
9. Ban unrelated refactors.
10. Run validation commands.

Every Cursor task must end with:

```text
1. Files changed
2. Design decisions
3. Tests added
4. Commands run and results
5. Security considerations
6. Risks / concerns
7. Follow-up work explicitly NOT completed
```

---

# 12. Definition of Done

A feature is not done unless:

- acceptance criteria pass
- types pass
- lint passes
- deterministic tests exist
- relevant e2e coverage exists
- database constraints were considered
- auth/authz was considered
- tenant isolation was considered
- loading/empty/failure states exist
- audit needs were considered
- accessibility was checked
- observability is adequate
- no secret is exposed client-side
- architectural docs are updated if required
- risks/concerns are documented

---

# 13. Launch Gates

## Internal Alpha
- authentication
- catalog
- CRM
- event builder
- inventory
- proposals
- calendar

## Staff Beta
- real email
- customer portal
- online deposits
- operations
- waivers

## AI-Assisted Beta
- AI drafts responses
- employee approves send
- evaluation suite passes

## Limited AI Autonomy
- low-risk questions
- qualification
- configured follow-ups
- monitoring and easy takeover

## Production
- payment reconciliation
- restore-tested backups
- incident/runbook
- privacy terms
- security review
- observability
- email deliverability
- Stripe live mode
- rollback process

## On-Site POS Go-Live
- Terminal pilot reader
- facility network test
- cashier UX test
- failed/cancelled payment recovery
- receipt flow
- refund permissions
- reconciliation


---

# 16. Module Entitlements & Commercial Flexibility

MagicCRM must support modular product access from the beginning, even though pricing will be decided later.

The application must keep **feature entitlement** separate from **user permission**.

These answer different questions:

```text
Entitlement:
Has this organization purchased or been granted access to this module?

Permission:
May this specific user access or administer this feature?
```

Both checks may be required.

Example:

```text
Organization has AI_SALES_AGENT entitlement
AND
User has ai.manage permission
```

Do not encode subscription names such as `PRO`, `PREMIUM`, or `ENTERPRISE` directly into feature code.

Bad:

```ts
if (organization.plan === "premium") {
  showAiAgent();
}
```

Preferred:

```ts
await requireEntitlement(ctx, "AI_SALES_AGENT");
await requirePermission(ctx, "ai.manage");
```

## Initial module keys

Use stable internal identifiers:

```text
CORE_CRM
EVENT_BOOKING
ONLINE_BOOKING
POS
OPERATIONS
COMMUNICATIONS
AI_SALES_AGENT
ADVANCED_ANALYTICS
MULTI_LOCATION
SSO
```

These are product capabilities, not pricing plans.

## Recommended future schema

### FeatureDefinition

Platform-owned catalog of product modules.

```text
key
name
description
active
```

### OrganizationEntitlement

```text
id
organizationId
featureKey
status
startsAt nullable
expiresAt nullable
source
metadata JSON nullable
createdAt
updatedAt
```

Suggested entitlement statuses:

```text
TRIAL
ACTIVE
SUSPENDED
EXPIRED
```

Potential future source values:

```text
MANUAL
SUBSCRIPTION
TRIAL
PROMOTION
ENTERPRISE_CONTRACT
```

## Organization vs location entitlement

The architecture should eventually allow both organization-wide and location-specific module access.

Do not implement location-specific billing logic in Phase 0, but do not hard-code assumptions that all entitlements must always be global forever.

## Billing independence

Billing should eventually produce entitlements.

Core application code should not care whether access came from:

- Starter plan
- Pro plan
- AI add-on
- 30-day trial
- custom enterprise agreement
- manual support grant

This keeps future pricing strategy flexible.

## Trial support

Entitlements should support trials without special-case product code.

An expired trial must fail closed unless another active entitlement exists.

## UI behavior

Navigation may hide or upsell unavailable modules, but UI visibility is never the security boundary.

Every server-side feature entry point must enforce entitlement.

## AI cost protection

The AI Sales Agent entitlement must make it possible later to support:

- included AI inquiry volume
- usage counters
- trial limits
- rate limits
- overage billing
- tenant-level AI disable switch

Prefer business-readable usage metrics such as AI-managed inquiries and conversations rather than exposing token accounting.

## Entitlement audit

Audit important events such as entitlement granted, suspended, expired, trial started, or trial extended.

## Phase implementation

Phase 0: define the entitlement boundary/interface only.  
Phase 1/1B: add tenant-safe entitlement evaluation alongside permissions if needed.  
Later commercial phase: connect subscriptions/billing to entitlement grants.

The actual pricing strategy must remain outside core feature logic.
