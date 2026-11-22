# Phase 12E — Severity-ranked issues & recommended roadmap

Legend: **Defect** = incorrect/misleading relative to intended rules. **Friction** = design recommendation. Blocked delivery ≠ bug.

## Severity-ranked issue list

| ID | Sev | Type | Stage | Issue |
|---|---|---|---|---|
| E01 | P1 | Defect | Quote | **Unit cents** editor shows raw cents (`4999`, `55000`) while summaries use dollars — high mis-edit risk |
| E02 | P1 | Defect | WP Overview | Customer activity funnel shows “Customer selected plan” / “Ready for Live Agent” for `PUBLIC_EVENT_REQUEST` |
| E03 | P1 | Friction | Language | Employee-facing `tenant_live`, `approved_plugin_baseline`, MagiCRM/WP key paths in primary banners |
| E04 | P1 | Friction | Queue | Section title “Ready for Live Agent” groups WP staff-review with LA READY TO BOOK |
| E05 | P1 | Friction | Roles | Default Front Desk / Operations lack `crm.inquiries.view` — cannot do event intake |
| E06 | P1 | Friction | Next-action | “N attention items before customer send” while send is indefinitely blocked |
| E07 | P2 | Friction | WP header | Duplicate “staff review required” eyebrow + banner |
| E08 | P2 | Friction | Tabs | Default Overview when draft exists — extra click to primary work (Staff quote) |
| E09 | P2 | Friction | Recs | Warning count badge on Recommendations reads like “10 recommendations” |
| E10 | P2 | Friction | Quote | No leave-page dirty warning for unsaved staff edits |
| E11 | P2 | Friction | Quote | Price override denied explained only via input `title` |
| E12 | P2 | Friction | Mobile | Quote line editing / LA readiness length cumbersome |
| E13 | P2 | Friction | Notes | “Internal / customer follow-up note” blurs internal vs customer communication |
| E14 | P2 | Friction | LA | Duplicate Start working / readiness blocks; raw history event keys |
| E15 | P3 | Friction | Availability | Occasional raw `NOT_VALIDATED` echo beside human labels |
| E16 | P3 | Friction | Recs | Catalog discrepancy uses WP product keys |
| E17 | P3 | Friction | Home | Soft-nav flake from attention tiles (unconfirmed) |
| E18 | P3 | Friction | Queue | Card meta line truncation on narrow widths |

## Quick wins (low risk)

| Rec | Problem | Solution | Benefit | Complexity | Risk | Owner? |
|---|---|---|---|---|---|---|
| Q1 | Unit cents | Label “Unit price ($)” + dollar input or cents→display formatter | Prevent pricing errors | S | Low (presentation + parse) | No if display-only; Yes if changing stored field UX |
| Q2 | WP funnel stages | Branch funnel labels for `PUBLIC_EVENT_REQUEST` | Correct mental model | S | Low | No |
| Q3 | Delivery jargon | Plain language: “Customer email delivery is off until venue prices are verified” | Confidence | S | Low | No |
| Q4 | Attention strip | “before you contact the customer” / “before internal approval” | Removes false send urgency | S | Low | No |
| Q5 | Recs badge | “10 warnings” or icon-only | Clarity | XS | Low | No |
| Q6 | Override hint | Visible helper under Unit price when read-only | Role clarity | XS | Low | No |
| Q7 | Notes label | “Internal staff note (not emailed)” | Safety | XS | Low | No |
| Q8 | Queue section title | “Needs staff follow-up” (keep description) | Less LA-centrism | S | Low | Optional |

## Workflow improvements (preserve rules)

| Rec | Problem | Solution | Benefit | Complexity | Risk | Owner? |
|---|---|---|---|---|---|---|
| W1 | Extra click to quote | Default tab Staff quote when draft exists / warnings | Faster prep | S | Low | No |
| W2 | Long Recommendations | Collapse alternatives; sticky “use this plan” affordance (no ranking change) | Compare faster | M | Med | No |
| W3 | Mobile quote | Sticky save bar; dollar fields; fewer columns | Usable on phone | M | Med | No |
| W4 | Unsaved edits | `beforeunload` / in-app discard confirm | Prevent lost work | S | Low | No |
| W5 | LA history noise | Humanize system event keys | Scanability | S | Low | No |
| W6 | Deduplicate LA coach | Single Start working + stepper | Less scroll | S | Low | No |

## Larger decisions (owner input)

| Rec | Problem | Options | Risk |
|---|---|---|---|
| L1 | Front Desk can’t see inquiries | Add `crm.inquiries.view` (+ limited manage?) to Front Desk template | Permission expansion |
| L2 | Customer delivery still off | Keep gate until `tenant_live` / live price revalidation | Operational, not UX-only |
| L3 | Dual WP + LA paths | Keep separate; invest in language parity only vs unify later | High if merged early |
| L4 | Automation (auto-claim, auto-HOLD) | Resist until quote language fixed | Process risk |
| L5 | Customer messaging from CRM | Currently mailto / blocked email delivery | Product + compliance |

## Proposed Phase 12F implementation scope

**Theme:** Employee language & quote clarity (not bookings/schedule redesign from original 12B roadmap numbering).

### In scope

1. Q1–Q8 quick wins (labels, funnel, badges, notes, queue section title).
2. W1 default tab heuristic; W4 unsaved guard; W6 LA dedupe.
3. Unit price presentation tests (unit + e2e synthetic only).
4. Screenshot refresh under `docs/design/phase-12f-screenshots/` (synthetic org).
5. Explicit non-goals: no `canDeliver` flip, no Scenario Lab, no permission template change unless L1 approved, no ranking/pricing math changes.

### Out of scope / later

- Bookings + Schedule visual redesign (original 12B “12E”).
- Knowledge/Resources polish.
- Enabling customer quote email / payments.
- Merging WP and Live Agent workspaces.

### Success criteria for 12F

- New employee can edit a synthetic quote without asking what “cents” means.
- WP Overview never implies customer selected a bookable Live Agent plan.
- Delivery remains blocked and clearly explained in plain language.
- Zero Production data mutations in the implementation PR beyond code.
