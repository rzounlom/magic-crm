# WordPress Event Planner 3.3.0 → MagicCRM parity

MagicCRM replaces the multi-step public Personal Event Planner with the Generations WordPress Event Planner **3.3.0** experience:

1. Customer completes one form  
2. Inquiry is saved for the organization  
3. Recommendations are calculated **privately** for staff  
4. Customer sees a thank-you confirmation only  
5. Employees review, follow up, and use existing CRM / booking / inventory / payment workflows  

Public submit must **not** auto-display Good / Recommended / Premium, create bookings, hold inventory, or collect payment.

## Canonical sources

Duplicates under `~/Downloads` and `~/Downloads/WP Plugging- Event Planner Intake/` are byte-identical. Use:

- `generations-event-planner-next-3.3.0.zip`
- `Generations_Event_Planner_Master_Rulebook_V3_Consolidated.xlsx`
- `Generations_Event_Planner_Calculation_Engine_V3_Consolidated (2).xlsx`

Executable plugin + `docs/approved-rules.json` (`rules_version: 2026-11-02`) are the operational baseline. Workbooks clarify intent; **do not** treat workbook prices as Production catalog prices.

## Documents in this folder

| File | Deliverable |
|---|---|
| [01-architecture-assessment.md](./01-architecture-assessment.md) | Existing MagicCRM assessment |
| [02-wordpress-form-field-map.md](./02-wordpress-form-field-map.md) | Exact WP form field map |
| [03-rule-comparison.md](./03-rule-comparison.md) | WP ↔ MagicCRM rule conflicts |
| [04-single-page-intake-design.md](./04-single-page-intake-design.md) | Proposed single-page intake |
| [05-reusable-components.md](./05-reusable-components.md) | Components and services |
| [06-data-model-compatibility.md](./06-data-model-compatibility.md) | Schema / migration stance |
| [07-staff-workflow.md](./07-staff-workflow.md) | Staff integration plan |
| [08-parity-test-strategy.md](./08-parity-test-strategy.md) | Parity-test strategy |
| [09-decisions-and-blockers.md](./09-decisions-and-blockers.md) | Locked decisions |
| [10-implementation-order.md](./10-implementation-order.md) | Implementation order + next phases |
| [11-phase-2-calculator-status.md](./11-phase-2-calculator-status.md) | Phase 2 calculator coverage |
| [12-phase-2-final-report.md](./12-phase-2-final-report.md) | Phase 2 parity evidence + blockers |
| [13-tenant-pricing-adapter.md](./13-tenant-pricing-adapter.md) | Tenant pricing precedence |
| [14-phase-3-status.md](./14-phase-3-status.md) | Phase 3 milestones |
| [15-phase-3-final-report.md](./15-phase-3-final-report.md) | Phase 3 final evidence |
| [16-production-release-notes.md](./16-production-release-notes.md) | Production release notes |
| [17-generations-pricing-baseline.md](./17-generations-pricing-baseline.md) | Adopt WP pricing as Generations baseline |
| [17-pricing-reconciliation.md](./17-pricing-reconciliation.md) | WP export ↔ MagicCRM catalog reconcile report |
| [18-approved-plugin-baseline-activation.md](./18-approved-plugin-baseline-activation.md) | Activate approved plugin catalog for Generations |
| [19-phase-7-infrastructure-audit.md](./19-phase-7-infrastructure-audit.md) | Phase 7 reuse / avoid-auto-trigger audit |
| [20-phase-7-wp-to-quote-draft.md](./20-phase-7-wp-to-quote-draft.md) | WP calc → staff quote draft mapping + flow |
| [21-phase-7-final-report.md](./21-phase-7-final-report.md) | Phase 7 deliverable report |
| [22-phase-7b-quote-delivery-audit.md](./22-phase-7b-quote-delivery-audit.md) | Phase 7B delivery audit + pricing gate |
| [23-phase-7b-final-report.md](./23-phase-7b-final-report.md) | Phase 7B approve/send report |
| [24-phase-7c-final-report.md](./24-phase-7c-final-report.md) | Phase 7C roles, email adapter, inventory, amount guards |

## Branch

`phase-7-staff-quote-draft` from Production `ab0178d` / `origin/main`. Staff-controlled quote draft + approve/send + operational readiness. No Scenario Lab; no Production catalog overwrite; no live customer email until `tenant_live` + provider.
