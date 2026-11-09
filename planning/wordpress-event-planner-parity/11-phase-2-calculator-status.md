# Phase 2 — WP 3.3.0 private calculator status

## Pricing / configuration source

- **Active source:** WordPress plugin `Catalog::defaults()` (`rules_version` / `Catalog::VERSION` = `2026-11-02`)
- **Labeled in snapshots as:** `pricing_source: "plugin_defaults"`
- **Not used:** live WP admin `gapnext_price_overrides`, workbook spreadsheet prices, Production Neon catalog prices
- Live WP admin package library is empty by default in MagicCRM (`packages: []`) unless a tenant injects definitions via `EngineConfig`

## Implemented

- Full TypeScript port of `Engine` (validate, recommend, candidates, complete, schedule, food, arcade, merge)
- Catalog defaults + override helper + revision hash
- Custom package eligibility helpers (no WP option storage)
- Private calc on `createPublicWpEventInquiry` with staff-only snapshot in message metadata
- Staff inquiry detail panel for answers + private plans / warnings
- Golden vitest suite ported from `tests/engine-test.php` expected totals
- PHP compare harness (`tools/wp-parity/php-compare.mjs`) when PHP CLI is available

## Not yet covered / deferred

- Full `packages-test.php` Reflection / custom package install suite (~66 assertions)
- Full `arcade-allocation-test.php` Reflection on private `arcade_lines` (~12 assertions)
- Live WP admin price overrides / custom package library sync into tenant config
- Mapping tenant MagicCRM catalog SKUs onto WP attraction keys
- Staff timer form
- Public package publishing (intentionally out of scope)

## Parity evidence policy

Do not claim complete parity until live PHP↔TS comparisons cover the full engine-focused fixture set and mismatches are resolved without weakening WordPress expected results.
