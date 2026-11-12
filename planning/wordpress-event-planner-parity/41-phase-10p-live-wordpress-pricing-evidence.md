# Phase 10P — Live WordPress pricing evidence recovery

**Date:** 2026-11-11  
**Mode:** READ-ONLY evidence recovery  
**No Production writes.** No pricing-source change. No `tenant_live`. No `canDeliver`. No deposit/hours/catalog edits. No emails. No Scenario Lab. Exporter was **not** installed on live WordPress.

## Verdict

**Authoritative live WordPress effective pricing was not obtained.**

Public evidence confirms the Event Planner plugin is live and that shipped docs/defaults still say bowling shoes **$3.50**, while the homepage markets **$4.00**. That does **not** prove the live calculator’s effective rate. Final revalidation remains **blocked** until a `gapnext_effective_pricing_v1` export (or equivalent `manage_options` attestation) is provided.

## 1. Exporter inspection

Location: `tools/wp-parity/wordpress-plugin-export/`

| Item | Finding |
| --- | --- |
| Capability | Standalone ZIP `dist/magiccrm-gapnext-pricing-export-1.0.0.zip` |
| Access required | WP Admin `manage_options`; Event Planner active |
| Install path | Plugins → Upload → Activate → **Event Planner → Export pricing** → Download JSON |
| Live install this phase | **Not performed** (would modify live WP plugins; owner must authorize) |
| Format | `gapnext_effective_pricing_v1`, `effective_source: live_wordpress` |
| Fields | `plugin_version`, `catalog_version` / `rules_version`, `catalog_revision`, `packages_revision`, `catalog_defaults`, `catalog_effective`, `price_overrides_option` (`gapnext_price_overrides`), `price_diffs_from_defaults`, `custom_packages_all` / `_active`, tax note (F&B 7% hardcoded), engine embedded-rule flags, exporter metadata |
| Overrides / packages | Yes — reads live options + `Packages::active()` |
| Security | Admin-post + nonce; no public REST; no PII |
| Local harness | Ran successfully against local 3.3.0 plugin copy; **baseline-only**, not live |

Local harness outputs (tooling proof only):

| File | revision | shoes ¢ | diffs | packages |
| --- | --- | --- | --- | --- |
| `effective-pricing-defaults.json` | `889a29ae88d4` | 350 | none | 0 |
| `effective-pricing-with-overrides.json` | `b8020d5ad7b5` | 450 | `bowling.shoes=450`, `food.salad=2699` | 1 (synthetic) |

## 2. Authorized live evidence attempt

| Probe | Result |
| --- | --- |
| MagiCRM `.env` WP credentials | **None** (`WP_*` / WordPress admin keys absent) |
| Live `gapnext_effective_pricing_v1` JSON in repo | **Absent** |
| Unauthenticated export endpoint | None by design — not attempted as bypass |
| `/custom-events/` | 200; `GAPNext` ajax localize present (ajax URL + emailDomains only; **no prices**) |
| Plugin assets | `planner.js` / `planner.css` `ver=1793648419` |
| `planner.js` price literals | **None** (shoes/350/400 absent) — pricing is server-side |
| Plugin PHP entry | HTTP 200, **0-byte body** — semver not publicly readable |
| `includes/Catalog.php` | 404 publicly |
| `docs/approved-rules.json` | **200**, 43400 bytes, SHA256 prefix `5bf721e272028859` — **byte-identical** to local 3.3.0 package docs; `rules_version: 2026-11-02`; shoes documented as **$3.50** (no `$4.00`) |
| `wp-login.php` | Present; no admin session available to this agent |

**Stop condition met:** Without `manage_options` access (or an owner-supplied export file), live effective rules cannot be recovered without installing the exporter or bypassing WP permissions — both disallowed.

### Access needed (exact)

1. WordPress administrator (`manage_options`) for `generations-adventureplex.com`, **or** hand-delivery of an already-downloaded export JSON.
2. Install + activate `tools/wp-parity/wordpress-plugin-export/dist/magiccrm-gapnext-pricing-export-1.0.0.zip` (temporary; deactivate/delete after download is fine).
3. Download **effective pricing JSON** from Event Planner → Export pricing.
4. Deliver that file to MagicCRM for `scripts/wp-parity-import-pricing.ts` / Phase 10K readiness re-run (import still requires separate owner authorization — Phase 10P does not import).

## 3. Bowling shoe discrepancy

| Source | Amount | Evidence |
| --- | --- | --- |
| Homepage marketing | **$4.00 +tax** | Live HTML: `Shoe rental: $4.00 +tax` |
| Approved MagiCRM baseline | **350¢ ($3.50)** | `catalog.ts` + snapshot revision `889a29ae88d4` |
| Live plugin docs (`approved-rules.json`) | **$3.50** | Public plugin docs identical to local package |
| Local plugin Catalog defaults | **350¢** | Local 3.3.0 `Catalog.php` |
| Live calculator effective rate | **Unknown** | Not in public JS; overrides unread |

**Classification**

- Homepage vs baseline/docs: **LIVE CONFIGURATION MISMATCH on marketing content** (homepage outdated **or** intentionally different from calculator — cannot tell from marketing alone).
- Live WordPress calculator shoes: **STILL UNVERIFIED**.
- Do **not** treat $4.00 as the live calculator price.

## 4. Live-versus-baseline comparison

**Not executable** without `catalog_effective` + overrides from live WordPress.

| Area | Status |
| --- | --- |
| Bowling / shoes / axe / laser / golf / climb / arcade | Unverified vs live effective |
| Food & beverage | Unverified vs live; MagiCRM catalog salad 1999¢ vs WP baseline 2499¢ remains **APPROVED_CATALOG_DIFFERENCE** (Option A) |
| Rooms / extra hours | Unverified vs live; lower_extra catalog 5000¢ vs WP baseline 7500¢ remains **APPROVED_CATALOG_DIFFERENCE** (Option A) |
| Taxes / fees | Exporter documents F&B 7% hardcoded; live confirmation blocked |
| Discounts / package constraints / custom packages | Live overrides & active packages unknown |
| Deposit | MagiCRM Production still 25% — not revalidated against WP deposit UX this phase |

**Option A preserved:** WordPress pricing governs WP-derived transactions; MagiCRM booking-catalog SKUs are not overwritten by this phase.

Public docs fingerprint only proves shipped rulebook text matches local 3.3.0 — **not** that `gapnext_price_overrides` is empty on production.

## 5. Calculation parity

| Suite | Result | Label |
| --- | --- | --- |
| `wp-parity-approved-baseline` + `wp-parity-arcade-golden` | 16/16 passed | **Baseline-only** |
| `phase-10k-live-pricing-revalidation-readiness.ts` | Blocker unchanged; synthetic scenarios use `approved_plugin_baseline` | **Baseline-only** — not live parity |
| Live WordPress engine scenarios | Not run | Missing live effective rules |

## 6. Production safety confirmation

| Gate | Status after Phase 10P |
| --- | --- |
| `pricingSource` | Unchanged `approved_plugin_baseline` |
| Approved baseline version | Unchanged `2026-11-02` / revision `889a29ae88d4` |
| `finalLivePriceRevalidation` | Still `pending` |
| `canDeliver` | Still `false` |
| Deposit | Still 25% |
| Hours policy | Still VERIFIED (untouched) |
| Catalog prices | Untouched |
| Email / card payments / Scenario Lab | Untouched |
| Live WP plugin / options | Untouched (exporter not installed) |
| Customer / inquiry writes | None |

## 7. Exact next owner decision

Provide authoritative live evidence, then decide — **do not** flip gates in the same step as “please collect”:

1. **Authorize** temporary install of `magiccrm-gapnext-pricing-export-1.0.0.zip` on live Generations WordPress (or upload an already-exported JSON).
2. Hand MagicCRM the downloaded `gapnext_effective_pricing_v1` file (or attested Admin screenshots of plugin version, overrides, and packages).
3. After review of live-vs-baseline diffs:
   - If matched: authorize `finalLivePriceRevalidation=complete` (separate write).
   - Optionally authorize import → `tenant_live` (separate write; Option A still applies to WP-derived quotes).
   - Separately authorize any of `canDeliver`, live email, card payments.

Until (1)–(2) land, MagiCRM must keep treating live calculator prices as **unverified**.
