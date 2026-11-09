# 5. Reusable components and services

## Reuse

- Public action / `SecurityActionResult` pattern
- Org resolve, primary location, honeypot, rate limit, audits
- `PublicCustomerShell`
- Inquiry / Conversation / Message persistence
- Staff Live Agent, booking, inventory, payment
- `EventPlanRecommendation.payload` for future private snapshots

## New (first slice)

- `src/lib/event-planner/wp-intake-contract.ts` — WP field constants + mapping helpers
- `src/server/inquiries/wp-intake-validation.ts` — Zod validation
- `createPublicWpEventInquiry` — thank-you submit (no package redirect, no Booking)
- `submitPublicWpEventInquiryAction`
- Thank-you route under `/inquire/[organizationSlug]/thanks`

## Later

- `PublicEventInquiryForm` UI
- Staff detail panel for WP answers + private snapshot
- `src/server/event-planner/wp-parity/` calculator port
