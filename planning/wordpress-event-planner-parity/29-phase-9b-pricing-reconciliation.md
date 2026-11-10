# Phase 9B — WordPress vs booking catalog pricing reconciliation

**Branch:** `phase-9b-wp-catalog-pricing-reconciliation`  
**Generations org:** `mdutc2nkvpafezukeem8942v`  
**Pricing source (unchanged):** `approved_plugin_baseline`  
**Catalog version:** `2026-11-02`  
**WP authority:** owner-approved plugin files in-repo (no new WordPress export)  
**Constraints:** no Production catalog/price/inventory/booking/payment writes; quote delivery blocked; live email disabled; not `tenant_live`

---

## Separation of concerns

| Concern | Meaning | Phase 9B outcome |
| --- | --- | --- |
| **Calculation parity** | WP engine cents match plugin baseline | Intact — calculator uses `wpCatalogDefaults` / approved baseline pack |
| **Transaction amount integrity** | Employee-approved / WP draft cents survive booking & deposit | Strengthened — amount guard now covers WP staff drafts + forbids empty lineItems |
| **Production catalog alignment** | MagiCRM SKU seed equals WP | **Not required** for go-live of WP quotes; 2 known mismatches documented; catalog left unchanged |

---

## 1. Reconciliation summary (plugin defaults ↔ booking-catalog seed)

Re-validated via `reconcileWpExportAgainstMagicCrmCatalog` + seed `scripts/data/generations-booking/booking-catalog.json`.

| Metric | Count |
| --- | --- |
| Mapped matches | **33** |
| Mapped different | **2** |
| Missing MagiCRM products for mapped keys | **0** |
| Unmapped WP catalog keys | **22** |
| Active WP custom packages in export | **0** |

### Confirmed Production catalog (read-only)

| SKU | Production amount | WP counterpart |
| --- | --- | --- |
| `salad-pan` | **1999¢** | `food.salad` **2499¢** |
| `lower-event-room.additionalHourCents` | **5000¢** | `rooms.lower_extra` **7500¢** |
| `lower-event-room.amountCents` | **15000¢** | `rooms.lower` **15000¢** (match) |

---

## 2. Material discrepancies (WP wins for quote money)

| WP key | WP ¢ | MagiCRM SKU / field | MagiCRM ¢ | Δ | Classification | Inventory | In quote | Booking line | Treatment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `food.salad` | 2499 | `salad-pan.amountCents` | 1999 | +500 | food_catering | no | yes | yes | Keep catalog; preserve WP 2499¢ on quote/booking lines |
| `rooms.lower_extra` | 7500 | `lower-event-room.additionalHourCents` | 5000 | +2500 | pricing_only_adjustment | **no extra unit** | yes | yes | Pricing-only hour; preserve WP 7500¢; inventory already from room rental |

Owner decision later: align MagiCRM seed, or permanently accept WP-wins documentation. **Do not overwrite Production.**

---

## 3. Unmapped WP keys — classification (not missing SKUs by default)

| WP key | Classification | Inventory required | Quote / booking line | Recommended treatment |
| --- | --- | --- | --- | --- |
| `bowling.half_weekday` | wordpress_only_calculation | no* | yes | Lane duration math in WP engine |
| `bowling.half_weekend` | wordpress_only_calculation | no* | yes | Same |
| `bowling.game_weekday` | wordpress_only_calculation | no* | yes | Per-game rate |
| `bowling.game_weekend` | wordpress_only_calculation | no* | yes | Per-game rate |
| `bowling.exclusive_peak` | wordpress_only_calculation | yes (lanes) | yes | Peak exclusive buyout |
| `bowling.pins` | wordpress_only_calculation | no | yes | Specialty add-on |
| `axe.private_sat` | wordpress_only_calculation | yes | yes | Sat private rate; `axe-den-2h` is non-Sat twin |
| `laser.game` | wordpress_only_calculation | no* | yes | Single game |
| `laser.thursday` | wordpress_only_calculation | no* | yes | Weekday special |
| `laser.games` | wordpress_only_calculation | no* | yes | Multi-game bundle |
| `laser.blast` | catalog_composite_or_package | no* | yes | Do not merge with MagiCRM package SKUs |
| `golf.adult` | wordpress_only_calculation | yes | yes | WP rate ≠ package SKU shape |
| `golf.child` | wordpress_only_calculation | yes | yes | Same |
| `climb` | wordpress_only_calculation | yes | yes | ≠ `climbers-cove-90` package |
| `pitcher` | food_catering | no | yes | F&B add-on |
| `drink_card` | food_catering | no | yes | F&B add-on |
| `rooms.cove` | inventory_resource_requirement | yes | yes | Soft-map climbing-area; no price SKU twin |
| `mezzanine.sat_after` | wordpress_only_calculation | yes | yes | Different window than MagiCRM SKU |
| `facility.sat_before` | wordpress_only_calculation | yes | yes | Related MagiCRM SKUs exist — not auto-mapped |
| `facility.sun_thu_after` | wordpress_only_calculation | yes | yes | Calculation + exclusive inventory |
| `facility.fri_after` | wordpress_only_calculation | yes | yes | Same |
| `facility.sat_after` | wordpress_only_calculation | yes | yes | Related to `full-facility-sat-after-4` — not invented |

\*Attraction inventory still comes from Phase 8 resource mapping when the attraction is selected; these keys are **price shape** classifications, not “no bowling holds.”

Code: `src/server/event-planner/wp-parity/component-classification.ts`

---

## 4. Pricing authority (WordPress-derived staff quote)

1. Private WP calculation supplies initial integer cents.  
2. Staff draft stores snapshotted `lineItems` + `wpQuoteDraft` provenance (`catalogBacked: false`).  
3. Authorized edits may change cents (`crm.quotes.price_override` for unit prices).  
4. **Final employee-approved quote (or WP staff draft used for booking) is money authority.**  
5. MagiCRM catalog must not silently replace those cents.  
6. Inventory requirements remain on the resource model (Phase 8).

`approved_plugin_baseline` is **not** relabeled `tenant_live`.

---

## 5. Financial lifecycle (implemented vs assumption)

| Step | Amount source | Implemented guarantee | Still assumption / ops |
| --- | --- | --- | --- |
| Private calculation | WP catalog / baseline | Integer cents in snapshot | — |
| Staff draft | Snapshot line items | Totals must match Σ lines | — |
| Staff edits | Explicit staff cents | No catalog lookup | Permission-gated |
| Employee approval | Same lines + marker on deliver | Customer payload copies cents | Delivery still blocked for baseline |
| Customer acceptance / pending booking | Quote `lineItems` + estimatedTotal | Guard enforces WP authority (marker **or** `wpQuoteDraft`) | Public delivery gated |
| Confirm booking | Same | Guard + lineItems copy | — |
| Deposit | `% of approved total` | `depositRequiredCents` | Tenant deposit % not WP-defined |
| Payment request / record | Booking totals | No SKU reprice found | External attest; no Stripe live path in this phase |
| Adjustments / refunds | N/A for WP path | Existing booking cancel / payment modules | Not expanded in 9B |

### Code fix (amount integrity)

`assertApprovedQuoteAmountsConsistent` now treats **WP staff drafts** (`wpQuoteDraft.source = wordpress_parity_private_calculation`) as money authorities when `onlyForEmployeeApprovedQuote` is set, and rejects positive totals with empty `lineItems` (prevents collapse onto zero-priced activity rows).

---

## 6. Room / attraction / inventory note

Phase 8 inventory mapping attaches soft requirements and exclusive rooms **without rewriting quote cents**. `rooms.lower_extra` remains pricing-only (no second inventory unit). Regression tests cover salad discrepancy preservation and draft≠catalog totals.

---

## 7. Tests added / run

- `tests/unit/approved-quote-amounts.test.ts` — WP draft enforcement  
- `tests/unit/wp-financial-lifecycle.test.ts` — discrepancies, unmapped classification, salad→booking→deposit, staff edit, draft vs calc  
- Existing reconcile + quote-booking-payment amount tests  

Full suite: typecheck, lint, unit, WP integration smoke, Production build (see PR).

---

## 8. Configuration recommendations (no Production writes)

1. Leave MagiCRM `salad-pan` / `lower-event-room.additionalHourCents` as-is until owner chooses catalog alignment.  
2. Keep Generations on `approved_plugin_baseline`.  
3. Keep customer quote delivery blocked.  
4. Keep `EMAIL_PROVIDER` unset/`none`.  
5. Optional later: owner-approved SKU mappings for facility/mezzanine window twins — only with explicit decision.

---

## 9. Remaining go-live blockers (quotes / payments)

- Customer quote delivery still blocked for baseline (by design).  
- Operational price verification for `tenant_live` not done.  
- Live email not configured.  
- Owner decision on permanent acceptance of salad / lower_extra deltas vs catalog update.  
- Deposit percent is tenant MagiCRM config, not WP.

## 10. Recommended next increment

**Phase 9C (suggested):** end-to-end synthetic pending→confirm fixture for WP approved quote with salad + lower_extra lines; owner decision sheet for the two catalog deltas; optional deposit-percent documentation for Generations.
