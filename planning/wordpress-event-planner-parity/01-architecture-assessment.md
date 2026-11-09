# 1. Existing MagicCRM architecture assessment

## Current public flow

`/inquire/[organizationSlug]` → multi-step `PublicIntakeWizard` → `submitPublicInquiryAction` → `createPublicInquiry` → always `generateEventPlansForInquiry` → redirect `/plan/{token}` with Good / Recommended / Premium.

Key files:

- `src/app/inquire/[organizationSlug]/page.tsx`
- `src/components/layout/public-intake-wizard.tsx`
- `src/server/actions/public-inquiry.ts`
- `src/server/services/inquiry-service.ts` (`createPublicInquiry`)
- `src/server/services/event-plan-service.ts` (`generateEventPlansForInquiry`)
- `src/components/layout/public-event-plan-view.tsx`

Success statuses today: `AWAITING_CUSTOMER` / `salesStage=PROPOSAL_READY`.

## Reuse

- ACTIVE org slug resolve, honeypot, rate limit
- Inquiry + Conversation + hashed public token
- Staff inquiry queue / detail / Live Agent
- Catalog, inventory, booking, payment transitions
- `EventPlanRecommendation` snapshot storage
- Existing `adultGuestCount` / `childGuestCount` columns
- Tenant isolation (no Generations runtime special-case)

## Adapt

- Single-page WP-parity form instead of wizard
- Split inquiry create from customer-facing package generation
- Thank-you only after public submit
- Attraction Yes / No / Open semantics
- Private calculation snapshot for staff review

## Preserve

Do not delete CRM, employee dashboard, catalog admin, inventory, proposal tools, booking, payment, or historical event-plan links.
