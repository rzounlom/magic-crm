# Phase 3 status — live PHP compare, packages/arcade, tenant pricing

## Live WordPress admin configuration

**Not available.** No `gapnext_price_overrides` or live custom package library was provided.  
All monetary parity evidence remains **plugin-default** (`Catalog::VERSION` `2026-11-02`).

Do **not** claim live Generations pricing parity.

## Three verification milestones (separate)

1. **Plugin-default calculation parity** — in progress / largely evidenced via golden vitest  
2. **Live WordPress configuration parity** — blocked (admin config unavailable)  
3. **MagicCRM tenant-catalog integration** — adapter scaffolded; no automatic catalog→price mapping yet  

## Tenant pricing adapter

See `13-tenant-pricing-adapter.md` and `src/server/event-planner/wp-parity/tenant-config.ts`.

Precedence: `tenant_live` → else explicit `plugin_defaults` (dev only). Incomplete tenant packs never silently fill from defaults.
