# 3. WordPress ↔ MagicCRM rule comparison

| Area | WP 3.3.0 | MagicCRM today | Parity decision |
|---|---|---|---|
| Attraction answers | Per-key yes / no / open | Interest id multi-select or empty=recommend | Adopt ternary; map keys via tenant config |
| Public publish | Private staff recommendation | Auto `/plan` packages | Thank-you only; staff inspects snapshot |
| Bowling lanes | `Engine::lanes()` with 48/50 cohort rules | Catalog `guestsPerUnit` | Port helper into tenant-configurable parity engine |
| Axe | Briefing window, weekday/weekend ages, Thu 2-for-1, Private Den | Catalog axe SKUs | Match WP in parity calculator |
| Food | Menu paths, combo offsets, 7% F&B tax in engine | Catalog FOOD + tax module | Tenant-configurable parity mode |
| Packages | Built-in + admin custom packages | `RecommendationProfile` composition | Config-driven; not Generations hardcoding |
| Dining schedule | Lane pizza ≤25 exception; otherwise blocks | Dining-first sequential | Pluggable WP scheduler for parity mode |
| Day specials | Mon bowling unpublished, etc. | Weekend/weekday price rows | Tenant day-special config |
| Prices | Plugin Catalog VERSION | Production Neon catalog | Never overwrite Production prices from workbooks |

Pin calculation snapshots to `approved-rules.json` `rules_version: 2026-11-02` (and a pricing revision hash when the WP calculator lands).
