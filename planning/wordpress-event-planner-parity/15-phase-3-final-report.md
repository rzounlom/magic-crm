# Phase 3 final report

Branch: `wordpress-parity-public-intake` (local only — not merged, not deployed)

## 1. PHP CLI setup and original PHP tests

| Item | Result |
|---|---|
| Homebrew `php` / `php@8.3` | Failed (Intel macOS Tier 3; source builds broken on gmp/gettext) |
| Working PHP | **conda-forge via micromamba** → `tmp/mamba-root/envs/php85/bin/php` |
| PHP version | **8.5.12** (cli, NTS) |
| `tests/engine-test.php` | **70 / 70 passed** |
| `tests/packages-test.php` | Not runnable here (requires local WordPress `GAPNEXT_WP_ROOT`) |
| `tests/arcade-allocation-test.php` | Not runnable here (requires WordPress + Emails) |

## 2. Live PHP ↔ TypeScript comparison

| Item | Result |
|---|---|
| Harness | `node tools/wp-parity/php-compare.mjs` + `tests/unit/wp-parity-php-live-compare.test.ts` |
| Fixtures compared | **15** live Engine recommend cases |
| Exact matches | **15 / 15** (+ pricing-revision smoke = 16 vitest assertions passed) |
| Mismatches | **0** |
| Root causes | n/a |
| Limitations | Plugin-default catalog only; no live WP admin overrides loaded |

## 3. Package suite (TypeScript golden)

| Item | Result |
|---|---|
| File | `tests/unit/wp-parity-packages-golden.test.ts` |
| Tests | **62 passed** |
| PHP totals preserved | 20000, 22560, 23500, 30000, 29990, 40000, etc. |
| Skipped (WP-only) | Plugin::save / post-meta history, Packages::page admin HTML |

## 4. Arcade suite (TypeScript golden)

| Item | Result |
|---|---|
| File | `tests/unit/wp-parity-arcade-golden.test.ts` |
| Tests | **11 passed** |
| Key totals | 78330 event; arcade funding 7500; golf 13000 |
| Skipped | Emails::internal pooled-card email wording |

## 5. Total verified parity cases

| Surface | Count | Pass | Fail |
|---|---|---|---|
| Live PHP↔TS fixtures | 15 | 15 | 0 |
| engine-test golden (TS) | 70 | 70 | 0 |
| packages golden (TS) | 62 | 62 | 0 |
| arcade golden (TS) | 11 | 11 | 0 |
| **Engine-focused verified** | **≥158** | **all** | **0** |
| Unresolved | Live WP admin pricing; full WP packages/arcade PHP under WordPress | — | blocked by env/config |

**Do not claim full Generations live-pricing parity.** Plugin-default calculation parity for the covered fixtures is evidenced.

## 6. Tenant pricing adapter

Implemented in `src/server/event-planner/wp-parity/tenant-config.ts`:

- Precedence: `tenant_live` → else explicit `plugin_defaults` (dev only)
- Incomplete tenant packs → `incomplete` (never silent fill from defaults)
- Attraction-key map field present; no automatic MagicCRM catalog price inventing

Docs: `13-tenant-pricing-adapter.md`

## 7–8. Pricing source / live WP admin

| Field | Value |
|---|---|
| Active public-intake source | `plugin_defaults` |
| Rules version | `2026-11-02` |
| Live WP admin overrides / packages | **Not available** |
| Staff UI | Banners for plugin_defaults / tenant_live / incomplete |

## 9. End-to-end staff workflow (integration)

`tests/integration/wp-public-inquiry-scenarios.test.ts` + thank-you test:

- Scenario A birthday bowling-only + food
- Scenario B corporate bowling+axe + open
- Scenario C mixed-age open + private room

All assert: thank-you path statuses, private snapshot present, **0 bookings**, **0 public event plans**, pricingSource recorded.

## 10. Validation

| Check | Result |
|---|---|
| Lint (touched WP paths) | clean |
| Typecheck | clean |
| Unit WP suites | **189 passed** (1 skipped = live-compare skip guard when PHP missing; with PHP present, live suite runs) |
| Integration WP | **4 passed** |
| Production build | passed |

## 11. Files changed (high level)

- `src/server/event-planner/wp-parity/**` (engine, packages validate, tenant-config, snapshot, from-intake)
- Public intake / thanks / staff answers panel
- `tools/wp-parity/php-compare.mjs`
- Planning docs 11–15
- Unit + integration tests listed in git status

## 12. Branch / working tree

`wordpress-parity-public-intake` — uncommitted Phase 1–3 work.  
`tmp/` holds local micromamba PHP (should stay untracked).

## 13. Remaining blockers before Preview

1. Obtain / load **live Generations WP admin** price overrides + custom packages if Preview must quote real venue rates  
2. Wire a real `WpTenantParityConfig` pack for the preview tenant (today still plugin defaults)  
3. Optional: WordPress fixture for running original packages/arcade PHP under `GAPNEXT_WP_ROOT`  
4. Product sign-off that plugin-default recommendations are acceptable for Preview staff review  
5. Still **do not merge to main / deploy Production** until those decisions land  
