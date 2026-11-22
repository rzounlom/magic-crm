# Phase 12F — Front Desk & Operations inquiry access (owner decision)

**No permissions were changed in Phase 12F.**

## Current defaults (`DEFAULT_SECURITY_GROUPS`)

| Role | `crm.inquiries.view` | `crm.inquiries.manage` | Notes |
|---|---|---|---|
| Administrators | Yes (all keys) | Yes | Full access |
| Event Sales | Yes | Yes | Primary sales persona |
| Front Desk | **No** | **No** | POS, customers view, limited events/calendar, payments collect |
| Operations | **No** | **No** | Events/calendar/waivers/inventory view |

Home attention tiles and Inquiries nav are omitted when `crm.inquiries.view` is absent — intentional from the current template design.

## Is this intentional?

Likely **yes for a POS-first Front Desk** and **operations floor staff** who should not edit quotes. It becomes a product mismatch if those roles answer phones for event requests.

## Recommendation (future, owner approval required)

1. **Front Desk (intake-only):** add `crm.inquiries.view` so they can open the queue and read detail. Optionally later: limited `crm.inquiries.manage` for notes/claim without `crm.quotes.approve` or `crm.quotes.price_override`.
2. **Operations:** keep inquiries hidden unless they cover sales phones; if needed, view-only only.
3. Do **not** grant quote approve, price override, or confirm booking to Front Desk without a separate decision.

Complexity: low (template + seed/backfill). Risk: expands who can see customer PII in inquiries.
