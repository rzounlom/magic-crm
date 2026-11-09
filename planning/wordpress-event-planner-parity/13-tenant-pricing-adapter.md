# 13 — Tenant pricing adapter (Phase 3)

Code: `src/server/event-planner/wp-parity/tenant-config.ts`

## Precedence (highest first)

1. `tenant_live` — a verified tenant WP-parity rule pack (catalog cents + packages + attraction key map) loaded for the organization.
2. `plugin_defaults` — Generations Event Planner 3.3.0 `Catalog::defaults()`, for development/parity testing **only**.

Rules:

- A supplied tenant pack that is incomplete (missing/invalid catalog key, missing `packages`, wrong organization, blank versions, or any `incompleteKeys`) resolves to `incomplete` with every missing key listed. It is **never** completed from plugin defaults or from the MagicCRM catalog. The calculation does not run; staff see the missing keys and must review by hand.
- Plugin defaults apply only when `allowPluginDefaults: true` and no tenant pack was supplied. The function default is `false`; public intake passes `true` today so existing behavior continues.
- `pricingSource` (`plugin_defaults | tenant_live | incomplete`) and `organizationId` are always recorded in the intake message metadata and the staff snapshot.
- No runtime branch on tenant identity. The adapter is tenant-agnostic.

## Status of live WordPress configuration

Live WP admin overrides (`gapnext_price_overrides`, saved packages) are still **not available** in-repo. Import/export plumbing exists (see `17-generations-pricing-baseline.md`); without a `live_wordpress` export file, public intake continues to record `plugin_defaults`. No Production Neon catalog rows are overwritten by import.

## Milestones

1. **Plugin-default parity (done).** The TS engine matches the PHP plugin's defaults (golden tests). Output is labeled `plugin_defaults`.
2. **Live WP config parity (in progress).** Admin-only WP JSON export + MagicCRM import → `WpTenantParityConfig` (`tenant_live`) + file loader. Blocked on obtaining the live Generations export.
3. **MagicCRM tenant-catalog integration (later).** Derive the rule pack from each organization's MagicCRM catalog so new tenants don't need a WordPress plugin. The `attractionKeyMap` links WP attraction keys to tenant product/interest ids so `attractionInterestIds` can be populated. This needs explicit parity review per tenant and must keep the "incomplete, never invented" rule.

## Not automatic

- Derivation of prices from the MagicCRM catalog.
- Overwriting Production catalog records from a WP export.
- Using `attractionKeyMap` to fill `attractionInterestIds` (still `[]`).
