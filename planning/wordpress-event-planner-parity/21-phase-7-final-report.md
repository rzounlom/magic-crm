# 21 — Phase 7 final report (staff quote draft)

Production baseline: `ab0178d` (PR #8). Branch: `phase-7-staff-quote-draft`. **Not merged / not deployed.**

## 1. Existing systems discovered

- WP public intake → private `WpParitySnapshot` in conversation metadata; no auto proposal/hold/booking
- Staff inquiry detail + `WpIntakeAnswersPanel`
- `EventPlanRecommendation` (`RECOMMENDATION` / `AGENT_WORKING`)
- Live Agent workspace (catalog reprice, availability, holds, pending booking)
- Inventory / resource reservations
- Payment attestation (no auto charge)
- Pricing verification gate (`tenant_live` only for customer-facing quotes)

## 2. Reusable components

Unchanged reuse: WP intake, private calc, staff panel, inventory, booking, payment services.

Adapter added: WP snapshot → `AGENT_WORKING` draft (`buildWpStaffQuoteDraft` + `createWpStaffQuoteDraftFromInquiry`).

Do **not** auto-call `generateEventPlansForInquiry` for WP intakes (publishes public RECOMMENDATIONs).

## 3. Workflow / state transitions

| Step | Effect |
| --- | --- |
| Public WP submit | `READY_FOR_HUMAN`, `salesStage=INQUIRY`, private snapshot only |
| Create staff quote draft | `AGENT_WORKING` plan; `selectedEventPlanId` + `agentWorkingPlanId`; `workflowStage=AGENT_WORKING`; **salesStage stays INQUIRY** |
| Customer visibility | None |
| Availability / hold / booking / payment | Explicit later tools only |

WP drafts stay on inquiry detail (not Live Agent catalog reprice UI). Catalog reprice of WP drafts is blocked.

## 4. WordPress → MagiCRM mapping

- Attraction keys → reference product slugs (`bowling-1h`, etc.); amounts from WP cents
- Line items keep WP labels; synthetic `wp-…` slugs when unmapped
- Known discrepancies (WP wins): `food.salad` 2499 vs 1999; `rooms.lower_extra` 7500 vs 5000
- Internal WP pricing components stay non-SKU line items

## 5. Implemented changes

- `src/server/event-planner/wp-parity/quote-draft.ts` — pure adapter
- `src/server/services/wp-staff-quote-draft-service.ts` — persist + auth + audit
- `src/server/actions/wp-staff-quote-draft.ts` — staff action
- `src/components/layout/wp-staff-quote-draft-panel.tsx` + inquiry page CTA
- Guard in `saveAgentWorkingPlan` against catalog wipe of WP drafts
- Planning docs 19–21; README links
- Unit + integration tests

## 6. Test results

- Unit `wp-staff-quote-draft.test.ts`: pass
- Integration `wp-staff-quote-draft.test.ts`: pass
- `tsc --noEmit`: pass
- Lint / full unit suite / Production build: see PR checks / local run notes

## 7. Remaining gaps

- Customer-facing quote send / acceptance
- Live Agent edit path that preserves WP cents (no MagiCRM catalog reprice)
- Availability check + hold from WP draft resource requirements
- Booking/payment amount consistency end-to-end after approval
- Mapping of remaining ~22 unmapped WP keys into MagiCRM inventory resources
- MagiCRM Neon catalog reconciliation (no overwrite this phase)

## 8. PR status

Opened from `phase-7-staff-quote-draft` — **do not merge/deploy** until reviewed.

## 9. Recommended next increment

Explicit **employee-approved customer quote** delivery (notification + customer visibility) while keeping inventory holds and bookings behind separate staff actions; then wire availability check against WP draft without catalog reprice.
