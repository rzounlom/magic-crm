# Planning

This folder is the living technical planning workspace for MagicCRM. It is **not** production application code.

Use it to decide architecture, record trade-offs, and specify work before implementation. Keep product copy, marketing, and the full PRD out of these files unless a planning document truly needs a short excerpt.

## Subfolders

### `architecture/`

System architecture documents. Current implementation notes:

- Phase 3B — transactional occupancy foundation complete
- Phase 3B.4 — segment-level resource scheduling, availability-aware proposals, employee New Booking
- Phase 3B.4a — booking cancellation, inquiry archive/unarchive, employee test-data cleanup
- Phase 3B.4b — employee workspace truth: original vs working vs confirmed vs allocated vs legacy HOLD
- Phase 3B.6 — proposal event length is the real itinerary span; rooms overlap; non-scheduled items stay off the sample itinerary; public times are 12-hour
- Phase 3B.6b — customer time copy formats a raw clock once; deposit percent comes from `Organization.depositPercent`; duration copy names scheduled time added beyond the base option
- Employee inquiry awareness — authenticated header polls about every 15 seconds; the bell and inquiry list update without a browser refresh (current)
- Phase 3C — Stripe/email next. Do not start the intake redesign yet.

- `database.md`
- `multi-tenancy.md`
- `authentication.md`
- `authorization.md`
- `team-management.md`
- `client-onboarding.md`
- `inquiries.md` — Personal Event Planner intake, Book Now pending bookings, Submit inquiry, employee New Booking, archive vs booking cancellation, employee workspace states, employee inquiry polling and notification bell
- `resource-schedule.md` — tenant finite-resource model, itinerary-segment occupancy, Admin inventory, Master Schedule occupancy vs pending bookings, confirmed allocated resources vs availability, cancelled reservations no longer block inventory, legacy HOLDs
- `booking.md` — pending vs confirmed bookings; segment windows; Confirm Payment & Book / `confirmPendingBooking`; original vs working vs confirmed snapshots; cancel vs delete; pre-segment bookings are not rewritten
- `proposal-engine.md` — availability-aware Good / Recommended / Premium; nearby itinerary search; Book Now precheck
- `communications.md` — inquiry vs selected-plan vs booking-confirmed emails; `CommunicationEvent` log without a mailer
- `ai-sales-agent.md`
- `ui-conventions.md` — includes the planned **Employee shell polish / sticky authenticated header** follow-up

The product source of truth remains `MAGICCRM_SAAS_ARCHITECTURE.md`. Expected later examples:

- `system-overview.md`
- `multi-tenancy.md`
- `authorization.md`
- `eventing.md`
- `integration-architecture.md`

### `decisions/`

Architecture Decision Records. Use sequential filenames:

```text
ADR-001-database-and-multi-tenancy.md
ADR-002-clerk-organizations-and-tenant-context.md
ADR-003-magiccrm-security-groups-and-permissions.md
ADR-004-team-invitations-and-client-bootstrap.md
ADR-005-ai-sales-agent.md
```

### `phases/`

Implementation phase plans. Expected later examples:

```text
phase-00-foundation.md
phase-01-tenancy.md
phase-02-catalog.md
```

### `features/`

Detailed feature specifications written before implementation.

### `database/`

Schema diagrams, data-model notes, indexing strategy, and migration planning.

### `api/`

Internal API contracts, server actions, route handlers, and external API design.

### `ai/`

AI agent architecture, prompts, tool contracts, eval strategy, and handoff rules.

### `security/`

Threat models, security requirements, authorization design, and audits.

### `testing/`

Test strategy, critical-path test cases, and QA plans.
