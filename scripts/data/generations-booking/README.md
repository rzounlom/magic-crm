# Generations booking catalog source

This folder is **tenant #1 bootstrap data** for Generations Adventureplex. It is not a MagicCRM platform default. Other organizations do not receive these products, resources, or recommendation profiles unless they are explicitly imported into that tenant.

Spreadsheets here are **source material**. Runtime import reads the compiled `booking-catalog.json` only.

Compile is a development dataset check-in, not a tenant special-case in application code. Import with:

```bash
npm run tenant:import-booking-catalog -- --slug <organizationSlug> --confirm IMPORT
```

Unresolved source ambiguities (pizza combo 4–5, brownie tray 45–40 typo, missing `$` on some Full Facility rows, bowling shoes as a separate add-on, no Beer Wall SKU) are printed by the importer and stored on the dataset as `ambiguities`.
