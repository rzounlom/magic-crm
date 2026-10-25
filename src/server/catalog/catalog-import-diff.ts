import type { BookingCatalogDataset } from "@/server/catalog/dataset";

export type CatalogSlugAction = {
  created: string[];
  updated: string[];
  unchanged: string[];
  preserved: string[];
};

export type CatalogImportDiff = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  depositPercent: {
    from: number;
    to: number | null;
    action: "update" | "unchanged";
  };
  categories: Omit<CatalogSlugAction, "preserved">;
  products: CatalogSlugAction;
  pricing: CatalogSlugAction;
  requirements: CatalogSlugAction;
  servings: CatalogSlugAction;
  grants: CatalogSlugAction;
  resourceTypes: Omit<CatalogSlugAction, "preserved">;
  resourcesCreated: number;
  resourcesUnchanged: number;
  profiles: CatalogSlugAction;
  interests: CatalogSlugAction;
  promotions: CatalogSlugAction;
  /** Human-readable replacements scoped to dataset slugs only. Never tenant-wide wipes. */
  scopedReplacements: string[];
  ambiguities: BookingCatalogDataset["ambiguities"];
};

export function emptySlugAction(): CatalogSlugAction {
  return { created: [], updated: [], unchanged: [], preserved: [] };
}

export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stable(nested)]),
    );
  }
  return value;
}

export function formatCatalogImportReport(
  diff: CatalogImportDiff,
  options: { dryRun: boolean; applied: boolean },
): string {
  const lines = [
    options.dryRun ? "Catalog import dry-run (no writes)." : options.applied ? "Catalog import applied." : "Catalog import planned.",
    `Organization: ${diff.organizationName} (${diff.organizationSlug})`,
    `Deposit: ${diff.depositPercent.from}% → ${diff.depositPercent.to ?? diff.depositPercent.from}% (${diff.depositPercent.action})`,
    formatGroup("Categories", diff.categories),
    formatGroup("Products", diff.products),
    formatGroup("Pricing", diff.pricing),
    formatGroup("Requirements", diff.requirements),
    formatGroup("Servings", diff.servings),
    formatGroup("Grants", diff.grants),
    formatGroup("Resource types", diff.resourceTypes),
    `Resources: created ${diff.resourcesCreated}, unchanged ${diff.resourcesUnchanged}`,
    formatGroup("Recommendation profiles", diff.profiles),
    formatGroup("Attraction interests", diff.interests),
    formatGroup("Promotions", diff.promotions),
  ];
  if (diff.scopedReplacements.length > 0) {
    lines.push("Scoped replacements:");
    for (const item of diff.scopedReplacements) {
      lines.push(`  - ${item}`);
    }
  } else {
    lines.push("Scoped replacements: none");
  }
  if (diff.ambiguities.length > 0) {
    lines.push("Dataset ambiguities:");
    for (const item of diff.ambiguities) {
      lines.push(`  [${item.severity}] ${item.code}: ${item.message}`);
    }
  }
  return lines.join("\n");
}

function formatGroup(label: string, group: { created: string[]; updated: string[]; unchanged: string[]; preserved?: string[] }): string {
  const preserved = group.preserved ?? [];
  return [
    `${label}:`,
    `  create ${group.created.length}${suffix(group.created)}`,
    `  update ${group.updated.length}${suffix(group.updated)}`,
    `  unchanged ${group.unchanged.length}${suffix(group.unchanged)}`,
    `  preserve ${preserved.length}${suffix(preserved)}`,
  ].join("\n");
}

function suffix(slugs: string[]): string {
  if (slugs.length === 0) {
    return "";
  }
  const preview = slugs.slice(0, 8).join(", ");
  return slugs.length > 8 ? ` (${preview}, …)` : ` (${preview})`;
}
