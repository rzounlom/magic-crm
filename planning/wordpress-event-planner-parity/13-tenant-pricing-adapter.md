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

Live WP admin overrides (`gapnext_price_overrides`, saved packages) were **not available** during this pass. No `tenant_live` pack exists, so every public intake currently records `plugin_defaults`. The staff panel labels this as a testing baseline, not verified live pricing. No Production data was read or changed; no Prisma migration was added.

## Milestones

1. **Plugin-default parity (done).** The TS engine matches the PHP plugin's defaults (golden tests). Output is labeled `plugin_defaults`.
2. **Live WP config parity (next).** Export the live Generations WP overrides and active packages, verify them against the live plugin (`Catalog::all()` revision), and load them as a `WpTenantParityConfig` (`tenant_live`) for the organization. Persistence and loading of the pack (storage, versioning, who may publish) is a separate design; nothing is stored in this pass.
3. **MagicCRM tenant-catalog integration (later).** Derive the rule pack from each organization's MagicCRM catalog so new tenants don't need a WordPress plugin. The `attractionKeyMap` links WP attraction keys to tenant product/interest ids so `attractionInterestIds` can be populated. This needs explicit parity review per tenant and must keep the "incomplete, never invented" rule.

## Not in this pass

- Automatic derivation of prices from the MagicCRM catalog.
- Storing or loading a tenant pack (no loader, no schema).
- Using `attractionKeyMap` to fill `attractionInterestIds` (still `[]`).
