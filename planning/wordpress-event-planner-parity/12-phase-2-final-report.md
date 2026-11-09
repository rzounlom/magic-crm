# Phase 2 final report — WP 3.3.0 private calculator

Branch: `wordpress-parity-public-intake` (local only; not merged; not deployed)

## 1. Calculator modules implemented

| Module | Role |
|---|---|
| `src/server/event-planner/wp-parity/catalog.ts` | Plugin default prices, overrides, revision hash |
| `packages.ts` | Custom package eligibility helpers |
| `engine.ts` | Full Engine port (validate → recommend) |
| `php-compat.ts` | PHP round / json / weekday helpers |
| `lanes.ts` | `Engine::lanes` |
| `sample.ts` | `Plugin::sample` |
| `snapshot.ts` | Staff-safe serializable snapshot |
| `from-intake.ts` | Intake answers → private calc outcome |
| `tools/wp-parity/php-compare.mjs` | Live PHP export harness (needs PHP CLI) |

## 2. WordPress rules covered

- Yes / No / Open attraction semantics and open-suggestion heuristics
- Bowling lanes, shoes, weekday/weekend rates, private buyouts, Pizza & Pins, Monday unpublished regular rate, Wednesday half-price lanes
- Axe briefing, 30/60, Thursday 2-for-1, AxeTreme, Private Axe Den feasibility
- Laser packages / Thursday special / private / LaserPlex / Games / Adventure Blast
- Golf, climbing, arcade credit allocation
- Food paths, offsets, 7% F&B tax, lane-dining exception (≤25 pizza/wings + bowling)
- Packages eligibility helpers; empty active package list by default
- Ranking, alternatives, duration / hard_review flags
- Schedule itinerary with America/Indiana/Indianapolis clock labels

## 3. Not yet covered

- Full `packages-test.php` custom-package install / Reflection suite
- Full `arcade-allocation-test.php` Reflection suite
- Live WP admin price overrides and custom package library sync
- Tenant catalog SKU → WP attraction key mapping
- Live PHP↔TS process comparison (PHP CLI not installed on this machine)

## 4. Original PHP tests inspected

| Suite | Approx. assertions |
|---|---|
| `engine-test.php` / `docs/engine-test-results.txt` | **70** checks passed |
| `packages-test.php` | ~66 |
| `arcade-allocation-test.php` | 12 |
| Other plugin suites (admin/email/staff/reports/…) | ~150+ (not calculator core) |
| **Engine-focused inspected** | **~148** |

## 5–6. Comparable parity cases

| Surface | Comparable | Passed | Failed |
|---|---|---|---|
| TS golden port of `engine-test.php` expected totals | **70** runtime checks (vitest) | **70** | **0** |
| Live PHP process ↔ TS | **0** (PHP CLI unavailable) | — | blocked |
| packages / arcade PHP Reflection suites | not yet ported as golden | — | remaining |

**Mismatch policy:** no WordPress expected totals were weakened. Live PHP comparison harness exists but could not execute without PHP.

## 7. Pricing / configuration source

`pricing_source: "plugin_defaults"` — WordPress plugin `Catalog::defaults()` / `VERSION 2026-11-02`.  
Not live admin overrides. Not Production Neon prices. Not workbook prices.

## 8. Staff recommendation integration

After public WP submit:

1. Inquiry persisted (`READY_FOR_HUMAN`, `salesStage=INQUIRY`)
2. Private calculator runs (pure; failures still keep the inquiry)
3. Snapshot stored on intake `ConversationMessage.metadata.privateCalculation`
4. Staff detail shows answers + private plans / warnings / line items
5. No `/plan` redirect, no Booking, no inventory hold, no payment

## 9–12. Validation & git

- Lint (touched paths): clean
- Typecheck: clean
- Unit WP suites: **88** passed
- Integration thank-you path: passed (private calc `ready`, no bookings)
- Production build: passed (`/inquire/.../thanks` included)
- Working tree: uncommitted Phase 1+2 work on `wordpress-parity-public-intake`
- No Prisma migration; Production env/catalog untouched; Scenario Lab untouched

## 13. Blockers before Production

1. Install PHP CLI and run `node tools/wp-parity/php-compare.mjs` plus a fuller export of engine fixtures
2. Port packages + arcade golden suites
3. Decide tenant config path for live prices/packages (still plugin defaults today)
4. Product/UX review of staff snapshot before enabling for customers
5. Explicit decision **not** to merge/deploy until the above evidence is accepted
