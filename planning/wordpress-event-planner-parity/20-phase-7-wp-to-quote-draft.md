# 20 — WP calculation → staff quote draft

## State transitions (this slice)

| Step | Inquiry effect |
| --- | --- |
| Public WP submit | `READY_FOR_HUMAN`, `salesStage=INQUIRY`, private snapshot in metadata |
| Employee creates quote draft | Creates `EventPlanRecommendation` `kind=AGENT_WORKING`; sets `selectedEventPlanId` + `agentWorkingPlanId`; `workflowStage=AGENT_WORKING`; **salesStage stays `INQUIRY`** |
| Customer visibility | **None** — no RECOMMENDATION rows, no `/plan` publish, no email |
| Availability / hold / booking / payment | Unchanged existing tools; not auto-run |

## Amount authority

For Generations (and any org using WP private calc): **approved WP baseline cents** drive draft `estimatedTotalCents` and line items.

Known MagiCRM catalog discrepancies (document only; do not overwrite Neon):

| WP key | WP | MagiCRM catalog | Draft uses |
| --- | --- | --- | --- |
| `food.salad` | $24.99 | $19.99 | **WP** |
| `rooms.lower_extra` | $75.00 | $50.00 | **WP** |

Draft payload records `catalogPriceDiscrepancies` when mapped SKUs differ so staff see the conflict before quoting from MagiCRM SKUs later.

## Attraction / SKU mapping (best-effort)

| WP attraction / price key | MagiCRM product slug (reference) | Inventory note |
| --- | --- | --- |
| bowling | `bowling-1h` (+ shoes on same product) | Bowling lane resources |
| axe | `axe-throwing-30` / `axe-throwing-60` | Axe lanes |
| laser | `unlimited-laser-tag-90` / arena rentals | Laser arena |
| golf | *(no 1:1 per-person SKU in seed)* | Mini golf course resource |
| climbing | `climbers-cove-90` | Climbing area |
| arcade | `unlimited-arcade-1h` | Soft capacity |
| food.* / rooms.* / mezzanine.* / facility.* | See `WP_TO_MAGICCRM_PRICE_MAPPINGS` | Rooms / facility resources |

Unmapped WP keys (half-hours, game rates, pins, drink_card, etc.) remain **internal calculation components** — draft line items keep WP labels with synthetic `wp-…` slugs; they are not invented MagiCRM catalog products.

## Adapter contract

`buildWpStaffQuoteDraft` / `createWpStaffQuoteDraftFromInquiry`:

- Input: inquiry + WP intake metadata (ready snapshot)
- Output: editable `AGENT_WORKING` plan with integer-cent line items, tax, itinerary, provenance (`pricingSource`, revision, calculated_at)
- Idempotent refresh of existing WP-sourced working draft when re-run
- Requires `crm.inquiries.manage`
- Tenant-scoped (`organizationId` match)

## Explicitly out of this slice

- Customer-facing quote send / acceptance
- Automatic availability hold
- Booking / payment creation
- MagiCRM catalog Neon updates
- Restoring public Good / Recommended / Premium auto-proposals for WP intakes
