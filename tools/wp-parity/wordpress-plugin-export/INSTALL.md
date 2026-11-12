# MagicCRM GapNext Pricing Export — WordPress install

Standalone WordPress plugin ZIP. Upload through **Plugins → Add New → Upload Plugin**.  
It does **not** edit Generations Event Planner files or pricing options.

**Owner authorization required before installing on live WordPress.**  
Phase 10Q safety review: `planning/wordpress-event-planner-parity/42-phase-10q-wordpress-pricing-exporter-safety.md`.

## ZIP location

After `./build-zip.sh`:

`tools/wp-parity/wordpress-plugin-export/dist/magiccrm-gapnext-pricing-export-1.0.0.zip`

## Administrator steps (live Generations site)

1. **Backup** the live WordPress site (host panel snapshot, Updraft/similar, or host backup). Keep it until this exporter is removed.
2. Confirm **Generations Event Planner — Next 3.3.0** is installed and **Active**.
3. Sign in as a WordPress **Administrator** (`manage_options`).
4. Go to **Plugins → Add New → Upload Plugin**.
5. Choose `magiccrm-gapnext-pricing-export-1.0.0.zip` → **Install Now** → **Activate**.
6. Open **Event Planner → Export pricing**.  
   - If Event Planner is inactive/incompatible: page appears under **Tools → Export pricing ⚠** with an error — fix Event Planner first.  
   - If neither menu appears: confirm the exporter is Active and your account is Administrator.
7. Review on-screen Event Planner version, catalog revision, price-diff count, and active custom package count.
8. Click **Download effective pricing JSON**.  
   - Expected filename: `gapnext-effective-pricing-YYYYMMDD-HHMMSS.json`  
   - Confirm the file opens as JSON with `"format": "gapnext_effective_pricing_v1"` (not an HTML login page).
9. Keep the JSON private; hand it to MagicCRM for review. Import remains a **separate** authorized step:

```bash
pnpm exec tsx --tsconfig tsconfig.json scripts/wp-parity-import-pricing.ts \
  --org <organizationId> \
  --file /path/to/gapnext-effective-pricing-….json
```

10. **Deactivate** then **Delete** this exporter plugin. Event Planner pricing is unchanged.
11. Do **not** disable security plugins, firewalls, 2FA, or capability restrictions to complete the export.

## Security

- Capability: `manage_options` only
- Download: `admin-post.php` + nonce (`magiccrm_gapnext_export_pricing`)
- No public REST route / unauthenticated URL
- JSON only — no inquiries, customers, credentials, or user ids
- Exporter performs no `update_option` / catalog / package writes

## Compatibility

- Requires Event Planner classes `Generations\PlannerNext\Catalog` and `Packages`
- Validated against plugin **3.3.0** / catalog **2026-11-02**
- Clear admin error if Event Planner is missing or incompatible
- Warning (export still allowed) if versions differ

## Local test (does not touch live WordPress)

```bash
cd tools/wp-parity/wordpress-plugin-export
./build-zip.sh
```

Uses the Event Planner copy under `~/Downloads/…/generations-event-planner-next` (or `WP_PLANNER_ROOT`) plus PHP stubs. Validates JSON with MagicCRM `parseWpPricingExport`.

## Superseded approach

Do **not** copy `gapnext-pricing-export.php` into the Event Planner plugin. That patch method is obsolete; use this standalone ZIP instead.
