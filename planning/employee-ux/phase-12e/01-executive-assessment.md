# Phase 12E — Executive usability assessment

## Verdict

Phase 12C/12D gave employees a clearer shell and a triage-first Inquiries workspace. A first-time employee can **find work**, **open an inquiry**, and **see who/what/when** without hunting through admin chrome.

They still cannot complete the full WordPress sales loop confidently without learning technical vocabulary (`Unit cents`, `tenant_live`, `approved_plugin_baseline`, ALL-CAPS READY TO BOOK next to WP staff-review rows). The **mental model** of draft → internal approval → customer delivery → hold → confirmed booking is **partially** communicated: delivery blocking is clear and correct; quote editing and WP funnel stages are not.

## What works

- Home **Needs attention** tiles with deep links (`?focus=review|pending|unread`).
- Queue sections: Pending confirmation · Ready for Live Agent · Other · Active/Archived.
- WP header answers the Stage B questions (customer, event type, date, guests, contact) above the fold.
- Status strip: Estimate · Availability · Quote · Delivery — useful working summary.
- Delivery gate copy is explicit; **Approve internal quote** is correctly not “send to customer.”
- Live Agent booking coach: Review → Availability → HOLD (optional) → Confirm, with HOLD ≠ confirm explained.
- Confirm stays disabled until claim; Place HOLD remains available — permissions feel intentional.

## What does not work yet

1. **Employee language debt** — technical pricing/policy strings appear in primary banners.
2. **WP funnel mislabel** — Overview “Customer activity” still shows Live Agent stages (“Customer selected plan”, “Ready for Live Agent”) for public event requests.
3. **Quote editor “Unit cents”** — values like `4999` / `55000` invite $49.99 vs $5500 mistakes.
4. **Queue section title** — “Ready for Live Agent” mixes legacy READY TO BOOK with WP staff-review rows; description helps, title does not.
5. **Role gap** — Front Desk and Operations **cannot see Inquiries at all** under default permissions; Event Sales can approve quotes but not override prices.
6. **Attention vs send framing** — “N attention items before customer send” while send is policy-blocked forever today → urgency without a permitted end state.

## Severity snapshot

| Severity | Count (confirmed UX) | Themes |
|---|---|---|
| P0 | 0 for permitted Admin/Event Sales paths | No blocker for “open inquiry / prepare draft / understand next gate” |
| P1 | 6 | Unit cents; WP funnel; jargon; queue mixing; Front Desk no inquiries; attention-before-send |
| P2 | 8 | Duplicate status copy; badge≠next step; long Recommendations scroll; mobile quote editing; etc. |
| P3 | 4 | Polish / caption tweaks |

**Blocked customer delivery is not a defect.**

## Recommendation for owners

Ship a **Phase 12F language + quote-editor clarity** pass before inventing new workflow stages. Preserve approval and delivery gates; change labels, defaults, and progressive disclosure first.
