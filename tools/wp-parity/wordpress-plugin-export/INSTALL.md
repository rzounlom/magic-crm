# MagicCRM GapNext Pricing Export — WordPress install

Standalone WordPress plugin ZIP. Upload through **Plugins → Add New → Upload Plugin**.  
It does **not** edit Generations Event Planner files or options.

## ZIP location

After `./build-zip.sh`:

`tools/wp-parity/wordpress-plugin-export/dist/magiccrm-gapnext-pricing-export-1.0.0.zip`

## WordPress installation steps (live Generations site)

1. Confirm **Generations Event Planner — Next 3.3.0** is installed and **Active**.
2. In WP Admin go to **Plugins → Add New Plugin → Upload Plugin**.
3. Choose `magiccrm-gapnext-pricing-export-1.0.0.zip` → **Install Now** → **Activate**.
4. Open **Event Planner → Export pricing**  
   (If Event Planner is inactive, the page appears under **Tools → Export pricing ⚠** with an error.)
5. Review the on-screen catalog revision / override / package counts.
6. Click **Download effective pricing JSON**.
7. Keep the JSON private; hand it to MagicCRM:

```bash
pnpm exec tsx --tsconfig tsconfig.json scripts/wp-parity-import-pricing.ts \
  --org <organizationId> \
  --file /path/to/gapnext-effective-pricing-….json
```

8. When finished exporting, you may **Deactivate** and **Delete** this exporter plugin. Event Planner pricing is unchanged.

## Security

- Capability: `manage_options` only
- Download: `admin-post.php` + nonce (`magiccrm_gapnext_export_pricing`)
- No public REST route / unauthenticated URL
- JSON only — no inquiries, customers, credentials, or user ids

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
