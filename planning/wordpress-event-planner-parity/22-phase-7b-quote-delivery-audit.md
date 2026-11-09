# 22 — Phase 7B audit (employee-approved quote delivery)

Baseline: PR #9 (`phase-7-staff-quote-draft`) on Production `ab0178d`.

## Live Agent / proposal assumptions (catalog model)

| Path | Assumes MagiCRM catalog prices? | WP-safe today? |
| --- | --- | --- |
| `saveAgentWorkingPlan` → `repriceWorkingPlan` | **Yes** | Guard throws on WP provenance |
| `generateEventPlansForInquiry` | **Yes** (Neon catalog / knowledge) | Must not auto-run on WP intakes |
| `adoptRecommendationAsWorkingPlan` | Overwrites with catalog RECOMMENDATION | Risk if RECOMMENDATION exists |
| Public `/plan` | Loads `kind=RECOMMENDATION` only | WP drafts invisible until publish |
| Email | Stub only (`NO_EMAIL_PROVIDER`) | WP auto-suppressed unless `tenant_live` |

## Pricing verification

- `isWpPrivatePricingVerifiedForCustomerQuote` = **`tenant_live` + `ready` only**
- `approved_plugin_baseline` is owner-approved for staff drafts; **not** customer-verified
- Do **not** relabel baseline as `tenant_live`

## Phase 7B policy decision

| Source | Preview | Employee approve | Customer delivery |
| --- | --- | --- | --- |
| `tenant_live` + ready | Yes | Yes | Yes |
| `approved_plugin_baseline` + ready | Yes | Yes | **Blocked** until operational verification (`tenant_live`) |
| `plugin_defaults` / incomplete | Limited | No | No |

Employee approval UI + staff customer-preview ship for Generations baseline; actual publish/send remains gated.

## Auto-triggers to avoid

- No quote on public WP inquiry submit
- No catalog reprice of WP line items
- No inventory hold on approve/send
- No Good / Recommended / Premium auto set for WP quotes (single approved quote only)
