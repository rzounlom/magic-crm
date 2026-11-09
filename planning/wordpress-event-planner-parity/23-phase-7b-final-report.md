# 23 — Phase 7B final report (employee-approved quote delivery)

Branch: `phase-7-staff-quote-draft` (extends PR #9). **Not merged / not deployed.**

## 1. Existing proposal / Live Agent assumptions

- Live Agent save path always reprices from MagiCRM catalog knowledge — blocked for WP drafts.
- Catalog `generateEventPlansForInquiry` publishes Good/Recommended/Premium `RECOMMENDATION` rows and sets `PROPOSAL_READY` — must not auto-run on WP intakes.
- Public `/plan` only loads `RECOMMENDATION` kinds.
- Email remains stubbed (`NO_EMAIL_PROVIDER`); notifications are recorded as skipped.
- Customer-quote verified pricing = **`tenant_live` + ready only**.

## 2. Employee editing and approval

- **Edit:** `updateWpStaffQuoteDraft` / explicit line-item + schedule edits; totals recomputed in integer cents; original WP totals preserved; parity claim cleared; audit `inquiry.wp_quote_draft_edited`.
- **Availability:** `checkWpStaffQuoteAvailability` reuses Live Agent check; no holds; UNAVAILABLE blocks approve/send.
- **Approve and send:** `approveAndSendWpStaffQuote` — auth, email required, policy gate, idempotent delivery, audit trail.

## 3. Pricing preservation

- Draft and customer quote amounts come from WP/staff-edited cents — never silent MagiCRM catalog substitution.
- Known salad / lower_extra discrepancies remain documented on staff draft only.

## 4. Availability-check behavior

- Runs before approve/send.
- Conflicts (`UNAVAILABLE`) block approval.
- Unmapped WP resources → not fully validated; customer quote carries a confirmation disclaimer; no automatic hold.

## 5. Customer-facing quote

- Single employee-approved quote (`employeeApprovedQuote` marker) — no Good/Recommended/Premium UI.
- Staff-only warnings, discrepancies, and pricing-source internals stripped.
- Customer can accept via existing `selectPublicEventPlan` action.

## 6. Pricing verification policy / remaining gates

| Source | Preview | Approve | Deliver |
| --- | --- | --- | --- |
| `tenant_live` + ready | Yes | Yes | Yes |
| `approved_plugin_baseline` + ready | Yes | Yes | **Blocked** (operational verification still required) |
| `plugin_defaults` / incomplete | Limited | No | No |

Baseline is **not** relabeled as `tenant_live`. Generations can approve and preview; Production customer delivery waits for `tenant_live`.

## 7. Tests

- Unit: delivery policy, edits, customer payload stripping, existing draft/pricing verification
- Integration: no auto quote on submit; baseline approve-without-deliver; tenant_live deliver + idempotent resend; email/auth/tenant isolation
- Lint / typecheck / build: run on PR update

## 8. PR status

PR #9 updated on `phase-7-staff-quote-draft` — still **do not merge/deploy**.

## 9. Remaining before safe Production merge

- Operational go-live: import/verify live WP pricing as `tenant_live` for Generations (or an explicit future policy change — not done here)
- Wire a real email provider for `EMPLOYEE_APPROVED_QUOTE`
- WP-safe Live Agent inventory mapping for stronger availability checks
- End-to-end booking/payment amount consistency after customer acceptance
- Manual Product verification on a Staging/local tenant with `tenant_live`
