# Verified WordPress tenant pricing packs

Place imported packs here as `<organizationId>.json` after running:

```bash
pnpm exec tsx --tsconfig tsconfig.json scripts/wp-parity-import-pricing.ts \
  --org <organizationId> \
  --file /path/to/gapnext-effective-pricing-….json
```

Only `live_wordpress` exports should be imported as `tenant_live`.

Pack files are gitignored. To load them at runtime, set:

```bash
export WP_PARITY_TENANT_PACK_DIR=scripts/data/wp-parity/tenant-packs
```

Without an explicit pack path, Generations uses the bundled `approved_plugin_baseline` registry. Other orgs fall back to unlabeled `plugin_defaults`.
