# 19 — Phase 7 infrastructure audit

Baseline: Production `ab0178d` (approved Generations WP plugin pricing).

## Reuse map

| Component | Verdict | Notes |
| --- | --- | --- |
| WP thank-you intake + private `WpParitySnapshot` in message metadata | **REUSE_UNCHANGED** | No auto proposal/booking/hold |
| Staff inquiry detail + `WpIntakeAnswersPanel` | **REUSE_UNCHANGED** | Review surface; gains draft CTA |
| Pricing verification (`tenant_live` only for customer quotes) | **REUSE_UNCHANGED** | Approved baseline stays non-customer |
| `EventPlanRecommendation` + `EventPlanPayload` | **NEEDS_ADAPTER** | WP snapshot → staff `AGENT_WORKING` draft |
| Live Agent workspace / availability / pending booking / confirm | **REUSE_UNCHANGED** | After draft exists |
| `generateEventPlansForInquiry` (catalog Good/Recommended/Premium) | **DO NOT AUTO-USE** on WP intakes | Publishes public RECOMMENDATIONs |
| Public `/plan` wizard path | **OBSOLETE for WP flow** | Keep for legacy wizard tenants |
| Email plan notification | **NOT LIVE** | Struct + suppression only; no provider |
| Inventory HOLDs / ResourceReservation | **REUSE_UNCHANGED** | Explicit staff hold only |
| Payment / Stripe | **FUTURE** | External attestation today; no auto charge |

## Auto-triggers to avoid

| Entry | Auto proposal | Auto booking | Auto hold | Auto customer email |
| --- | --- | --- | --- | --- |
| `createPublicWpEventInquiry` | No | No | No | No |
| `createPublicInquiry` (wizard) | **Yes** | No | No | Payload only (not sent) |
| `generateEventPlansForInquiry` | Writes RECOMMENDATION + may set `AWAITING_CUSTOMER` | No | No | Suppressed for WP handoff |

Phase 7 draft creation must **not** call the catalog generator for WP inquiries and must **not** set customer-facing `PROPOSAL_READY` / send email.

## Target employee path (smallest slice)

1. Open WP inquiry → review answers + private calc  
2. **Create staff quote draft** from private snapshot (`AGENT_WORKING`)  
3. Edit / check availability via existing Live Agent tools  
4. Later increments: explicit customer send → accept → pending booking → confirm → payment  

## Implemented in this increment

Staff-controlled **quote draft only** (local/testable). No merge/deploy requirement for Production customer data. No Scenario Lab. No catalog price overwrites.
