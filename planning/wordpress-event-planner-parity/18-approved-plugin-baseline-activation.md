# 18 — Activate approved WordPress plugin baseline for Generations

## Decision

Generations confirmed the provided Event Planner **3.3.0** plugin files (catalog `2026-11-02`) are the working baseline. No live WP DB export is required to continue development. Final live-price revalidation remains a **pre-go-live** task.

| Field | Value |
| --- | --- |
| Source | `approved_plugin_baseline` |
| Catalog version | `2026-11-02` |
| Approval basis | Generations owner confirmation |
| Final live-price revalidation | **pending** |
| Not claimed | `live_wordpress` / `tenant_live` DB overrides |

## Activation (tenant-scoped, not global)

Registry: `scripts/data/wp-parity/approved-plugin-baseline-orgs.json`

- Lists organization IDs that receive `buildApprovedPluginBaselineConfig()` (plugin `Catalog::defaults()` / `wpCatalogDefaults()`, empty custom packages).
- Generations CRM Test org `mdutc2nkvpafezukeem8942v` is listed.
- Other tenants remain on unlabeled `plugin_defaults` fallback (or their own packs).
- No runtime branch on organization name/slug.

Inquiry path: `loadWpTenantParityConfig(organization.id)` → approved baseline pack → calculator labels `approved_plugin_baseline`.

## Staff labels (new calculations only)

- Title: **Pricing source: Generations-approved WordPress plugin baseline**
- Status: *Using Generations-approved Event Planner pricing. Final price verification required before operational go-live.*
- Shows catalog/rules version, configuration revision, calculation timestamp, itemized plan.
- Historical inquiry snapshots are unchanged.
- Customer quotes / plan emails remain suppressed until `tenant_live` (verified live export).

## Catalog discrepancies (do not overwrite Production)

From `17-pricing-reconciliation.md` (plugin catalog vs MagicCRM booking-catalog seed):

| WP key | WP cents | MagicCRM | Resolution for WP-parity inquiries |
| --- | --- | --- | --- |
| `food.salad` | 2499 ($24.99) | `salad-pan` 1999 | **Use WP 2499** in private calculator |
| `rooms.lower_extra` | 7500 ($75.00) | `lower-event-room.additionalHourCents` 5000 | **Use WP 7500** in private calculator |

**Before employees issue final quotes or bookings from MagicCRM catalog products:** reconcile these SKUs (and any other diffs) in a deliberate catalog change set — do **not** silently overwrite Production Neon product prices from this PR.

### Unmapped WP keys (22)

Treat as:

**Internal / duration-band calculation components** (used by the WP engine; may not need a 1:1 MagiCRM SKU):  
`bowling.half_*`, `bowling.game_*`, `bowling.exclusive_peak`, `bowling.pins`, `laser.game`, `laser.thursday`, `laser.games`, `laser.blast`, `pitcher`, `drink_card`, mezzanine/facility day bands not already mapped.

**Likely standalone products to map or deliberately omit before go-live:**  
`axe.private_sat`, `golf.adult`, `golf.child`, `climb`, `rooms.cove`, remaining facility windows.

## Safeguards unchanged

- Public intake → thank-you only
- Employee review mandatory
- No auto quote / booking / inventory / payment from this calculation
- Scenario Lab untouched
- Production catalog DB rows not modified by this work

## Pre-go-live checklist

1. Optional: import live WP export when overrides/packages must be confirmed.
2. Align MagicCRM booking-catalog SKUs with approved WP cents where employees will quote from catalog.
3. Map or document remaining unmapped WP keys.
4. Flip `finalLivePriceRevalidation` to `complete` only after owner sign-off.
