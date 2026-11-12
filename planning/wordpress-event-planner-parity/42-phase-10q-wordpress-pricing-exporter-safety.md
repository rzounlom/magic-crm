# Phase 10Q — WordPress pricing exporter safety review

**Date:** 2026-11-11  
**Mode:** Source + ZIP review, offline local harness, Admin instruction prep  
**Live WordPress:** not installed / not activated  
**MagicCRM Production:** unchanged (no pricing gates, delivery, email, payments, hours, or Scenario Lab)

## Verdict

The standalone exporter **`magiccrm-gapnext-pricing-export-1.0.0`** is **ready for a separate owner decision** to install temporarily on live Generations WordPress. It is Admin-only, nonce-protected, read-only with respect to Event Planner pricing options, free of customer PII in the payload, and locally validated against MagiCRM `gapnext_effective_pricing_v1`.

This phase does **not** authorize live installation.

## 1. Source and ZIP safety review

### Package

| Item | Result |
| --- | --- |
| Source tree | `tools/wp-parity/wordpress-plugin-export/magiccrm-gapnext-pricing-export/` |
| ZIP | `tools/wp-parity/wordpress-plugin-export/dist/magiccrm-gapnext-pricing-export-1.0.0.zip` |
| ZIP ↔ source | **Byte-identical** (all 5 files MATCH after rebuild) |
| ZIP contents | Plugin bootstrap + `includes/{admin,compatibility,payload}.php` + `readme.txt` only |
| Superseded patch file | `gapnext-pricing-export.php` (parent folder) is **not** in the ZIP — do not use |
| ZIP SHA-256 | `9d0ef066330773a3e71658395c67f688dd3397062b63af269a53159c3c031106` |

### Security controls

| Control | Status |
| --- | --- |
| Capability | Menu + page + download require `manage_options` |
| CSRF | `wp_nonce_field` / `check_admin_referer('magiccrm_gapnext_export_pricing')` |
| Unauthenticated export | **None** — only `admin_post_magiccrm_gapnext_export_pricing` (no `admin_post_nopriv_*`) |
| Public REST | **None** — no `register_rest_route` |
| Activation / deactivation hooks | **None** — no `register_activation_hook` |
| Event Planner mutation | **None** — no writes to catalog, overrides, or packages |
| Option writes in exporter | **None** — source has no `update_option` / `add_option` / `delete_option` / `$wpdb` |
| Content type | `application/json; charset=utf-8` + attachment filename `gapnext-effective-pricing-YYYYMMDD-HHMMSS.json` |
| Fingerprints | Exports `plugin_version`, `catalog_version` / `rules_version`, `catalog_revision`, `packages_revision` |
| Malformed options | Non-array `gapnext_price_overrides` → empty; non-array `gapnext_prices_updated` → `null` |
| PII stripping | Keeps only `prices_updated.at`; drops user id / email keys |

### Residual notes (not blockers)

1. **WordPress core** will update `active_plugins` when any plugin is activated/deactivated — expected Admin behavior; Event Planner pricing options are untouched.
2. No Local WP app was available on this machine; security/capability/nonce/read-only checks used an instrumented PHP stub harness plus Event Planner 3.3.0 offline load.
3. Custom package **names** are whatever an Admin saved in Event Planner (pricing config), not inquiry/customer records.
4. Tax `food_beverage_rate: 0.07` is documented as Engine-hardcoded metadata, not a live WP option row.

### Risks / fixes

**No code fixes required for Phase 10Q.** No high-severity findings.

## 2. Local test results

| Test | Result |
| --- | --- |
| `./build-zip.sh` harness defaults export | revision `889a29ae88d4`, shoes **350¢**, 0 diffs, 0 packages |
| Harness synthetic overrides + package | shoes **450¢**, salad **2699¢**, 1 active package, revision `b8020d5ad7b5` |
| MagiCRM `parseWpPricingExport` + import preview | Both JSON files **OK** |
| `tests/unit/wp-parity-pricing-export.test.ts` | **3/3 passed** |
| Security harness (cap deny, nonce reject, zero writes, PII strip, no nopriv) | **12/12 passed** |
| Full Local Sites / Docker WP UI | **Not available** — documented limitation |

### Local export SHA-256

| File | SHA-256 |
| --- | --- |
| `dist/local-test-output/effective-pricing-defaults.json` | `18d800ba1b17ed4b2dc982de4727513385426ecb34cc8c1e9bd0f6ab8fe28e06` |
| `dist/local-test-output/effective-pricing-with-overrides.json` | `b986b20c7caa51a4aa5db81d17a7daa5969542db00a0efef0492bede14a3d58d` |

Note: `exported_at` is timestamped, so re-running the harness changes SHA-256 even when pricing content is unchanged.

## 3. Export schema verification

Validated format: **`gapnext_effective_pricing_v1`** with `effective_source: "live_wordpress"`.

Top-level keys observed:

`format`, `effective_source`, `plugin_version`, `catalog_version`, `rules_version`, `exported_at`, `site_host`, `catalog_revision`, `packages_revision`, `prices_updated`, `tax`, `engine_embedded_rules`, `catalog_defaults`, `catalog_effective`, `price_overrides_option`, `price_diffs_from_defaults`, `custom_packages_all`, `custom_packages_active`, `exporter`.

Privacy scan of local JSON: no emails, phones, inquiry/customer payloads, passwords, API keys, or auth tokens.

## 4. Read-only confirmation

- Exporter source performs **reads only** (`Catalog::*`, `Packages::*`, `get_option`).
- Instrumented harness: **zero** `update_option` calls during `Payload::build()` for defaults, malformed options, and override/package cases.
- Download path streams JSON and exits; it does not save pricing state.

## 5. Exact WordPress Admin instructions

Use ZIP:  
`tools/wp-parity/wordpress-plugin-export/dist/magiccrm-gapnext-pricing-export-1.0.0.zip`  
(SHA-256 `9d0ef066330773a3e71658395c67f688dd3397062b63af269a53159c3c031106`)

1. **Backup** the live Generations WordPress site (hosting panel backup, Updraft/similar, or host snapshot). Keep the backup until the exporter is removed.
2. Confirm **Generations Event Planner — Next** is **Active** (expected 3.3.0).
3. Sign in as a WordPress **Administrator**.
4. Go to **Plugins → Add New → Upload Plugin**.
5. Choose `magiccrm-gapnext-pricing-export-1.0.0.zip` → **Install Now** → **Activate**.
6. Open **Event Planner → Export pricing**.  
   - If the Event Planner menu is missing: check **Tools → Export pricing ⚠** (Event Planner inactive or incompatible — fix that first; do not export).  
   - If neither menu appears: confirm the exporter plugin is Active and you have Administrator privileges.
7. On the export screen, confirm Event Planner version, catalog/rules version, catalog revision, price-diff count, and active custom package count look sensible.
8. Click **Download effective pricing JSON**.  
   - Expected filename pattern: `gapnext-effective-pricing-YYYYMMDD-HHMMSS.json`  
   - Expected content type: JSON; top-level `"format": "gapnext_effective_pricing_v1"`.
9. Open the file briefly and confirm it is JSON (not an HTML login/error page) and includes `catalog_effective` + `catalog_revision`.
10. Send the JSON privately to MagicCRM (do **not** commit it to a public repo).
11. **Deactivate** then **Delete** plugin **MagicCRM GapNext Pricing Export**. Event Planner pricing should remain unchanged.
12. Do **not** disable security plugins, firewalls, 2FA, or capability restrictions to complete this export.

Import into MagiCRM / flipping `finalLivePriceRevalidation` / `tenant_live` / `canDeliver` are **out of scope** for this install — separate owner authorization after review.

## 6. Ready for owner-authorized installation?

**Yes — ready for a separate owner go/no-go** to install temporarily on live WordPress solely to obtain the effective pricing JSON.

Phase 10Q does **not** itself install, activate, import, or change MagiCRM gates.

## 7. Zero Production writes

Confirmed for this phase:

- Live WordPress plugins/options/pricing: **untouched**
- MagiCRM `finalLivePriceRevalidation`: still pending (not changed here)
- No `tenant_live`, no `canDeliver`, no deposit/hours/catalog/email/payment/Scenario Lab changes

## Exact next owner decision

Authorize temporary live install of the reviewed ZIP (or perform the Admin steps above) and deliver the downloaded `gapnext-effective-pricing-*.json` for Phase 10P/10K live-vs-baseline comparison — still without flipping MagiCRM delivery gates until that review completes.
