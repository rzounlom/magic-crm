# Phase 9C — Owner pricing decision record

**Date:** 2026-11-10  
**Branch / PR:** `phase-9b-wp-catalog-pricing-reconciliation` / PR #13  
**Scope:** Transaction money authority vs MagiCRM booking catalog for known WP discrepancies

## Known discrepancies (unchanged)

| WP key | WP cents | MagiCRM catalog | Catalog field / SKU |
| --- | ---: | ---: | --- |
| `food.salad` | 2499 | 1999 | `salad-pan` unit amount |
| `rooms.lower_extra` | 7500 | 5000 | `lower-event-room` `additionalHourCents` |

## Decision options

### A — Keep WP transaction values; leave catalog unchanged (recommended now)

- Employee-approved WordPress quote `lineItems` remain the money authority for pending booking, confirmation, deposit calculation, and payment balance handling.
- MagiCRM catalog SKUs stay at current seed/import values (1999¢ salad, 5000¢ lower extra hour).
- No Production pricing, inventory, booking, or historical payment writes for this alignment.
- Document the gap; do not silently reprice approved quotes from catalog.

### B — Later align MagiCRM catalog to the approved WP baseline

- After a separate owner review, update catalog products/prices so salad and lower extra hour match WP 2499¢ / 7500¢.
- Requires explicit approval, a dedicated change record, and regression of catalog-backed (non-WP) quote paths.
- Out of scope for Phase 9C / PR #13 merge.

## Recommendation

**Choose A immediately.**

Phase 9C end-to-end proof shows salad 2499¢ and lower-room additional hour 7500¢ survive inquiry → staff draft → approve → pending → confirm → deposit → simulated partial payment without falling back to catalog cents.

## Deposit note (not a price decision)

WordPress Event Planner does not define MagiCRM’s deposit ledger. MagiCRM deposit due = tenant `depositPercent` × approved quote total. Document any venue policy difference between historical WP deposit messaging and MagiCRM tenant configuration without changing either silently.

## Owner action

- [ ] Accept **A** for go-live continuity (WP transaction cents win; catalog unchanged).
- [ ] Optionally schedule **B** as a later catalog alignment project with explicit approval.
