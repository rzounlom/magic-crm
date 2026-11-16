# Phase 11A — WordPress Event Planner 3.5.0 logic parity

**Date:** 2026-11-16  
**Branch:** `phase-11a-wp-350-logic-parity`  
**Mode:** Calculation / itinerary / recommendation parity only. No Production deploy. No pricing-gate changes.

## Plugin source

| Item | Path |
| --- | --- |
| Folder (typo preserved) | `planning/pluggin/3.5/` |
| ZIP | `planning/pluggin/3.5/generations-event-planner-next-3.5.0.zip` |
| Extracted source | `planning/pluggin/3.5/generations-event-planner-next/` |
| `GAPNEXT_VERSION` | **3.5.0** |
| `Catalog::VERSION` / `rules_version` | **2026-11-02** (unchanged) |

Calculation/itinerary changes landed in **3.4.0**; **3.5.0** keeps them and adds the WordPress updater. MagicCRM ports the 3.4/3.5 engine behavior.

## Change matrix

| # | Area | 3.5 plugin | Prior MagicCRM (3.3) | Match after 11A | Change |
| --- | --- | --- | --- | --- | --- |
| 1 | Cohort split | `Engine::group_sizes` even split | Fill-first `min(cap, n-i*cap)` | yes | Added `wpGroupSizes` |
| 2 | Bowling lanes | Sum over balanced 50-cohorts | Recursive fill-first | yes | Rewrote `wpBowlingLanes` |
| 3 | Schedule labels | Uses `group_sizes` (70→35/35) | 50/20 fill-first | yes | `schedule()` updated |
| 4 | Lane-1 note | `max(group_sizes)>48` | `n>48` | yes | Threshold updated |
| 5 | Bowling product names | `1 hour bowling` / `N hours bowling` | `Regular bowling` | yes | `candidates()` renamed |
| 6 | Timing / private rentals | Same `ceil(n/cap)` windows | Same | yes | None |
| 7 | Recommend ranking | Unchanged | Ported | yes | None |
| 8 | Compact itinerary | `Itinerary::compact` | Flat list only | yes | `itinerary.ts` + staff UI |
| 9 | Catalog prices | `2026-11-02` | Same | yes | **No pricing import** |
| 10 | Updater / WP reports / WP emails | WP-only | N/A | n/a | Documented only |

## Pricing comparison

| Check | Result |
| --- | --- |
| `approved-rules.json` `rules_version` | `2026-11-02` |
| Catalog shoes | 350¢ ($3.50) — unchanged |
| MagiCRM `WP_CATALOG_VERSION` | `2026-11-02` — unchanged |
| Production gates | Keep `approved_plugin_baseline`, `finalLivePriceRevalidation: pending`, `canDeliver: false`, deposit 25% |

**No pricing-policy change required.** Option A preserved.

## Historical inquiries

Engine changes apply to **new** private calculations only. Existing Production inquiry snapshots, drafts, and quotes are **not** recalculated or overwritten.

## WordPress-only (out of scope)

- `updater.php` / self-hosted update feed
- Scheduled inquiry report emails / Excel digests
- WordPress HTML email presentation beyond compact itinerary data used by MagiCRM staff UI

## Files changed (MagicCRM)

- `src/server/event-planner/wp-parity/lanes.ts`
- `src/server/event-planner/wp-parity/engine.ts`
- `src/server/event-planner/wp-parity/itinerary.ts` (new)
- `src/server/event-planner/wp-parity/index.ts`
- `src/components/layout/wp-intake-answers-panel.tsx`
- `tests/unit/wp-parity-lanes.test.ts`
- `tests/unit/wp-parity-itinerary-compact.test.ts` (new)
- `tools/wp-parity/php-compare.mjs`
- This document + parity README index

## Test results (local)

| Suite | Result |
| --- | --- |
| `tests/unit/wp-parity*.test.ts` | **200 passed**, 1 skipped |
| PHP↔TS live compare vs in-repo 3.5.0 (`php-compare.mjs`) | **ok** · 16 passed · catalog revision `889a29ae88d4` |
| `tsc --noEmit` | pass |
| `pnpm lint` | pass (no new errors) |
| `pnpm build` | pass |

Synthetic parity is against the **local** 3.5.0 plugin source — not live WordPress admin overrides.

## Safeguards (unchanged by this PR)

- Live WordPress plugin not modified
- Pricing exporter not installed
- No Production pricing / `tenant_live` / `canDeliver` / email / card / hours / Scenario Lab changes
- Production remains on verified `aed57b3` until a separate merge+deploy decision
- Historical Production inquiries are not recalculated
