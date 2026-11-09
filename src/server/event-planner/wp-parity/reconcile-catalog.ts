import type { WpCatalog } from "@/server/event-planner/wp-parity/catalog";
import { wpCatalogFieldKeys } from "@/server/event-planner/wp-parity/catalog";
import type { PackageDefinition } from "@/server/event-planner/wp-parity/packages";
import type { WpPricingExportV1 } from "@/server/event-planner/wp-parity/pricing-export";

/**
 * Reconcile a WordPress effective pricing export against the Generations MagicCRM
 * booking-catalog seed (or any product list with slug + prices[].amountCents).
 *
 * Does not merge or overwrite. WordPress export is the approved business baseline when live.
 */

export type MagicCrmCatalogProductPrice = {
  strategy?: string;
  amountCents?: number;
  weekdayAmountCents?: number;
  weekendAmountCents?: number;
  shoeAddOnCents?: number;
  additionalGuestCents?: number;
  additionalHourCents?: number;
  afterHourAmountCents?: number;
  [key: string]: unknown;
};

export type MagicCrmCatalogProduct = {
  slug: string;
  name: string;
  prices: MagicCrmCatalogProductPrice[];
};

export type WpToMagicCrmPriceMapping = {
  wpKey: string;
  productSlug: string;
  /** Which MagicCRM price field to compare (default amountCents). */
  magicField?:
    | "amountCents"
    | "weekdayAmountCents"
    | "weekendAmountCents"
    | "shoeAddOnCents"
    | "additionalHourCents"
    | "afterHourAmountCents";
  note?: string;
};

/** Known 1:1 (or near) mappings between WP Catalog fields and Generations booking-catalog slugs. */
export const WP_TO_MAGICCRM_PRICE_MAPPINGS: readonly WpToMagicCrmPriceMapping[] = [
  { wpKey: "bowling.hour_weekday", productSlug: "bowling-1h", magicField: "weekdayAmountCents" },
  { wpKey: "bowling.hour_weekend", productSlug: "bowling-1h", magicField: "weekendAmountCents" },
  { wpKey: "bowling.shoes", productSlug: "bowling-1h", magicField: "shoeAddOnCents" },
  { wpKey: "bowling.exclusive_hour", productSlug: "bowling-lounge-1h" },
  { wpKey: "bowling.exclusive_two", productSlug: "bowling-lounge-2h" },
  { wpKey: "bowling.all_access", productSlug: "all-access" },
  { wpKey: "axe.half", productSlug: "axe-throwing-30" },
  { wpKey: "axe.hour", productSlug: "axe-throwing-60" },
  { wpKey: "axe.xtreme", productSlug: "axe-treme" },
  { wpKey: "axe.private", productSlug: "axe-den-2h" },
  { wpKey: "laser.pass", productSlug: "unlimited-laser-tag-90" },
  { wpKey: "laser.plex", productSlug: "laser-plex-card" },
  { wpKey: "laser.private", productSlug: "laser-tag-arena-90" },
  { wpKey: "laser.private_sat", productSlug: "laser-tag-arena-sat-hourly" },
  { wpKey: "food.combo", productSlug: "pizza-pitcher-combo" },
  { wpKey: "food.boneless", productSlug: "boneless-wings-36" },
  { wpKey: "food.traditional", productSlug: "traditional-wings-36" },
  { wpKey: "food.pretzels", productSlug: "pretzel-bite-platter" },
  { wpKey: "food.strips", productSlug: "chicken-strip-platter" },
  { wpKey: "food.salad", productSlug: "salad-pan" },
  { wpKey: "food.boards", productSlug: "charcuterie-boards" },
  { wpKey: "food.cookies", productSlug: "cookie-tray" },
  { wpKey: "food.brownies", productSlug: "brownie-tray" },
  { wpKey: "food.fajita", productSlug: "fajita-bar" },
  { wpKey: "food.slider", productSlug: "slider-bar" },
  { wpKey: "food.bbq", productSlug: "smokehouse-bbq" },
  { wpKey: "rooms.lower", productSlug: "lower-event-room" },
  { wpKey: "rooms.upper", productSlug: "skybox" },
  { wpKey: "rooms.lower_extra", productSlug: "lower-event-room", magicField: "additionalHourCents" },
  { wpKey: "rooms.upper_extra", productSlug: "skybox", magicField: "additionalHourCents" },
  { wpKey: "mezzanine.sun_thu", productSlug: "mezzanine-sun-thu" },
  { wpKey: "mezzanine.fri", productSlug: "mezzanine-friday" },
  { wpKey: "mezzanine.sat_before", productSlug: "mezzanine-saturday" },
  { wpKey: "mezzanine.two", productSlug: "mezzanine-2h-fri-sat" },
  { wpKey: "facility.before", productSlug: "full-facility-before-4-sun-fri" },
];

export type PriceMatchRow = {
  wpKey: string;
  productSlug: string;
  wpCents: number;
  magicCents: number | null;
  status: "match" | "different" | "missing_product" | "missing_magic_field";
  magicField: string;
  note?: string;
};

export type ReconcileReport = {
  exportSource: string;
  exportCatalogRevision: string;
  exportExportedAt: string;
  matching: PriceMatchRow[];
  different: PriceMatchRow[];
  missingProducts: PriceMatchRow[];
  missingMagicFields: PriceMatchRow[];
  unmappedWpKeys: string[];
  magicOnlyProductSlugs: string[];
  packageNotes: string[];
  taxNotes: string[];
  eligibilityNotes: string[];
  summary: {
    matchCount: number;
    differentCount: number;
    missingProductCount: number;
    unmappedWpKeyCount: number;
    activeCustomPackageCount: number;
  };
};

function catalogValue(catalog: WpCatalog, key: string): number {
  const parts = key.split(".");
  if (parts.length === 1) {
    return catalog[key as keyof WpCatalog] as number;
  }
  const group = catalog[parts[0] as keyof WpCatalog] as Record<string, number>;
  return group[parts[1] as string] as number;
}

function magicAmount(
  product: MagicCrmCatalogProduct | undefined,
  field: NonNullable<WpToMagicCrmPriceMapping["magicField"]>,
): number | null {
  if (!product || !product.prices[0]) return null;
  const price = product.prices[0];
  const value = price[field];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function reconcileWpExportAgainstMagicCrmCatalog(input: {
  export: WpPricingExportV1;
  products: MagicCrmCatalogProduct[];
  mappings?: readonly WpToMagicCrmPriceMapping[];
}): ReconcileReport {
  const mappings = input.mappings ?? WP_TO_MAGICCRM_PRICE_MAPPINGS;
  const bySlug = new Map(input.products.map((p) => [p.slug, p]));
  const matching: PriceMatchRow[] = [];
  const different: PriceMatchRow[] = [];
  const missingProducts: PriceMatchRow[] = [];
  const missingMagicFields: PriceMatchRow[] = [];
  const mappedWpKeys = new Set<string>();

  for (const mapping of mappings) {
    mappedWpKeys.add(mapping.wpKey);
    const field = mapping.magicField ?? "amountCents";
    const wpCents = catalogValue(input.export.catalog_effective, mapping.wpKey);
    const product = bySlug.get(mapping.productSlug);
    if (!product) {
      missingProducts.push({
        wpKey: mapping.wpKey,
        productSlug: mapping.productSlug,
        wpCents,
        magicCents: null,
        status: "missing_product",
        magicField: field,
        note: mapping.note,
      });
      continue;
    }
    const magicCents = magicAmount(product, field);
    if (magicCents == null) {
      missingMagicFields.push({
        wpKey: mapping.wpKey,
        productSlug: mapping.productSlug,
        wpCents,
        magicCents: null,
        status: "missing_magic_field",
        magicField: field,
        note: mapping.note,
      });
      continue;
    }
    const row: PriceMatchRow = {
      wpKey: mapping.wpKey,
      productSlug: mapping.productSlug,
      wpCents,
      magicCents,
      status: wpCents === magicCents ? "match" : "different",
      magicField: field,
      note: mapping.note,
    };
    if (row.status === "match") matching.push(row);
    else different.push(row);
  }

  const unmappedWpKeys = wpCatalogFieldKeys().filter((key) => !mappedWpKeys.has(key));
  const mappedSlugs = new Set(mappings.map((m) => m.productSlug));
  const magicOnlyProductSlugs = input.products
    .map((p) => p.slug)
    .filter((slug) => !mappedSlugs.has(slug));

  const activePackages = input.export.custom_packages_active as PackageDefinition[];
  const packageNotes =
    activePackages.length === 0
      ? [
          "WordPress export has zero active custom packages. MagicCRM booking-catalog package SKUs (Have a Ball, etc.) are a separate catalog model — not silently merged.",
        ]
      : [
          `WordPress export has ${activePackages.length} active custom package(s). Compare eligibility/inclusions manually before activating tenant_live in Production.`,
        ];

  const taxNotes = [
    `WordPress F&B tax rate in export: ${input.export.tax.food_beverage_rate}. MagicCRM WP-parity engine hardcodes 0.07 like the plugin.`,
    "MagicCRM booking-catalog seed does not store a parallel tax rate field for these SKUs.",
  ];

  const eligibilityNotes = [
    "Weekday specials, package eligibility, arcade credit allocation, and food inclusions live in the WP Engine/Packages rules (ported to TypeScript), not as MagicCRM catalog rows.",
    "Do not treat MagicCRM product presence as proof of WP package eligibility parity.",
  ];

  return {
    exportSource: input.export.effective_source,
    exportCatalogRevision: input.export.catalog_revision,
    exportExportedAt: input.export.exported_at,
    matching,
    different,
    missingProducts,
    missingMagicFields,
    unmappedWpKeys,
    magicOnlyProductSlugs,
    packageNotes,
    taxNotes,
    eligibilityNotes,
    summary: {
      matchCount: matching.length,
      differentCount: different.length,
      missingProductCount: missingProducts.length,
      unmappedWpKeyCount: unmappedWpKeys.length,
      activeCustomPackageCount: activePackages.length,
    },
  };
}

export function formatReconcileReportMarkdown(report: ReconcileReport): string {
  const lines: string[] = [];
  lines.push("# WordPress ↔ MagicCRM pricing reconciliation");
  lines.push("");
  lines.push(`- Export source: \`${report.exportSource}\``);
  lines.push(`- Catalog revision: \`${report.exportCatalogRevision}\``);
  lines.push(`- Exported at: \`${report.exportExportedAt}\``);
  lines.push(
    `- Summary: ${report.summary.matchCount} match, ${report.summary.differentCount} different, ${report.summary.missingProductCount} missing product, ${report.summary.unmappedWpKeyCount} unmapped WP keys, ${report.summary.activeCustomPackageCount} WP custom packages`,
  );
  lines.push("");
  lines.push("## Different prices (WP baseline vs MagicCRM catalog)");
  if (report.different.length === 0) {
    lines.push("_None in mapped fields._");
  } else {
    for (const row of report.different) {
      lines.push(
        `- \`${row.wpKey}\` → \`${row.productSlug}.${row.magicField}\`: WP ${row.wpCents}¢ vs MagicCRM ${row.magicCents}¢`,
      );
    }
  }
  lines.push("");
  lines.push("## Matching prices");
  lines.push(`_Count: ${report.matching.length}_`);
  for (const row of report.matching) {
    lines.push(`- \`${row.wpKey}\` = ${row.wpCents}¢ (\`${row.productSlug}\`)`);
  }
  lines.push("");
  lines.push("## Missing MagicCRM products for mapped WP keys");
  if (report.missingProducts.length === 0) {
    lines.push("_None._");
  } else {
    for (const row of report.missingProducts) {
      lines.push(`- \`${row.wpKey}\` expected product \`${row.productSlug}\` (WP ${row.wpCents}¢)`);
    }
  }
  lines.push("");
  lines.push("## Unmapped WP catalog keys");
  for (const key of report.unmappedWpKeys) {
    lines.push(`- \`${key}\``);
  }
  lines.push("");
  lines.push("## Package / tax / eligibility notes");
  for (const note of [...report.packageNotes, ...report.taxNotes, ...report.eligibilityNotes]) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  lines.push(
    "## MagicCRM-only product slugs (not in WP mapping — review separately; do not overwrite Production)",
  );
  for (const slug of report.magicOnlyProductSlugs) {
    lines.push(`- \`${slug}\``);
  }
  lines.push("");
  return lines.join("\n");
}
