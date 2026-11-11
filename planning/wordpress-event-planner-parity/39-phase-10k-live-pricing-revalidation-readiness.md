# Phase 10K — Close hours docs + live pricing revalidation readiness

**Date:** 2026-11-11  
**Mode:** Documentation merge + **read-only** pricing review  
**No pricing-state promotion.** No `tenant_live`, no `canDeliver: true`, no email/card activation.

## Part A — PR #19

| Item | Result |
| --- | --- |
| PR | https://github.com/rzounlom/magic-crm/pull/19 |
| Files | `37-phase-10f-…md`, `38-phase-10j-…md`, `README.md` only |
| Application code / migrations / credentials | **None** |
| Vercel Preview (`magic-crm`) | Failed (ignored; no branch protection; Preview not relied on) |
| Scenario Lab Preview | Canceled by ignored build step |
| Merge | **MERGED** `3232e43` |
| Customer Production | **Ready** (`magic-palrigmkh…`, ref `3232e43`) |

## Part B — Live pricing revalidation (read-only)

### Authoritative sources distinguished

| Source | Status |
| --- | --- |
| Approved baseline `2026-11-02` / revision `889a29ae88d4:approved_plugin_baseline` | Active in MagiCRM registry for Generations |
| Currently deployed WordPress plugin | `generations-event-planner-next` **is live** on `/custom-events/` (assets `ver=1793648419`, `GAPNext` ajax localize present) |
| Exact live plugin semver | **Not readable** from public assets (PHP entry returns empty; `readme.txt`/`catalog.php` not public) |
| Live WP admin overrides (`gapnext_price_overrides`) / custom packages | **Missing evidence** — no `live_wordpress` export this phase |
| MagiCRM Production pricing config | `approved_plugin_baseline`; `finalLivePriceRevalidation: pending`; deposit 25%; `canDeliver: false` |

**Conclusion:** Final live revalidation is **BLOCKED** until an authoritative live WordPress effective-pricing export (or owner-attested WP Admin evidence) confirms live rules.

Exporter tooling already exists: `tools/wp-parity/wordpress-plugin-export/`.

### Findings (classified)

| Classification | Count | Highlights |
| --- | --- | --- |
| MATCH | 8 | Registry; bowling hour/half; axe hour; laser game; golf adult/child (homepage ↔ baseline) |
| APPROVED CATALOG DIFFERENCE | 4 | `food.salad` 2499 vs catalog 1999; `rooms.lower_extra` 7500 vs catalog 5000 (Option A; Production spot-check confirms catalog unchanged) |
| LIVE CONFIGURATION MISMATCH | 1 | Homepage shoe rental **$4.00** vs approved baseline **350¢ ($3.50)** — marketing page; live gapnext value still unverified |
| UNVERIFIED / MISSING EVIDENCE | 1 | Live `gapnext_price_overrides` + packages + exact plugin semver |

### Synthetic calculation parity (approved baseline only; no Production writes)

| Scenario | Status | Main plan | Total ¢ | Tax ¢ |
| --- | --- | --- | --- | --- |
| Bowling only (weekday) | ready | Regular bowling | 10200 | 0 |
| Bowling + food + private room | ready | Regular bowling | 49536 | 938 |
| Axe + laser + golf (weekend) | ready | 1-hour axe + 90-Minute Laser Tag Pass | 78000 | 0 |
| Climbing + arcade + food | ready | Gathering and catering | 29336 | 938 |

All used `pricingSource=approved_plugin_baseline`, `rules_version=2026-11-02`.  
Unit/golden suites `wp-parity-approved-baseline` + `wp-parity-arcade-golden`: **16/16 passed**.

These prove MagiCRM baseline engine integrity — **not** live WordPress admin parity.

### Unchanged gates (confirmed)

| Gate | Value |
| --- | --- |
| Pricing source | `approved_plugin_baseline` |
| `finalLivePriceRevalidation` | `pending` |
| Customer quote delivery | `canDeliver: false` |
| Deposit | 25% |
| Operating hours policy `s07kml2m6xfiwg8ood8vzc6r` | still **VERIFIED** |
| Scenario Lab / email / card payments | not activated |

## Exact owner decision required before any pricing-state promotion

Do **not** promote in Phase 10K. Before Phase 10L (or equivalent), owner must authorize after reviewing a Generations **live WordPress effective-pricing export**:

1. Confirm live plugin version/rules match approved baseline `2026-11-02`, **or** document every delta.
2. If matched, authorize setting `finalLivePriceRevalidation=complete`.
3. Optionally authorize importing the export as `tenant_live` (separate from MagiCRM booking-catalog SKUs; Option A remains WP-wins for WP-derived quotes).
4. Separately authorize any of: `canDeliver=true`, live email, card payments — none implied by (1)–(3).

## Script

`scripts/phase-10k-live-pricing-revalidation-readiness.ts` (read-only; fixture under `playwright/.fixtures/`, gitignored).
