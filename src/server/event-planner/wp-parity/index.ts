import { wpCatalogDefaults } from "@/server/event-planner/wp-parity/catalog";
import { WpParityEngine } from "@/server/event-planner/wp-parity/engine";
import type {
  EngineConfig,
  InquiryRaw,
  RecommendOptions,
  RecommendResult,
} from "@/server/event-planner/wp-parity/types";

export { wpBowlingLanes } from "@/server/event-planner/wp-parity/lanes";
export {
  Catalog,
  WP_CATALOG_VERSION,
  applyWpCatalogOverrides,
  wpCatalogDefaults,
  wpCatalogFieldKeys,
  wpCatalogRevision,
} from "@/server/event-planner/wp-parity/catalog";
export type { WpCatalog, WpCatalogOverrides } from "@/server/event-planner/wp-parity/catalog";
export { WpParityEngine } from "@/server/event-planner/wp-parity/engine";
export {
  EMPTY_ACTIVE_PACKAGES,
  attractionsFromPackage,
  foodLabels,
  isPackageEligible,
  packageDefinitionRevision,
  packageRawDefaults,
  packageRawFromDefinition,
  validatePackageDefinition,
} from "@/server/event-planner/wp-parity/packages";
export type {
  PackageBar,
  PackageDefinition,
  PackageFoodKey,
  PackageRawInput,
  PackageRoom,
  PackageValidationResult,
} from "@/server/event-planner/wp-parity/packages";
export { sampleWpInquiry } from "@/server/event-planner/wp-parity/sample";
export type { WpSampleInquiry } from "@/server/event-planner/wp-parity/sample";
export {
  calculatePrivateWpRecommendation,
  calculatePrivateWpRecommendationForOrganization,
  inquiryRawFromWpAnswers,
} from "@/server/event-planner/wp-parity/from-intake";
export type { PrivateWpCalculationOutcome } from "@/server/event-planner/wp-parity/from-intake";
export {
  WP_MISSING_TENANT_CONFIG_KEY,
  WP_PLUGIN_DEFAULTS_WARNING,
  listWpTenantConfigMissingKeys,
  resolveWpParityEngineConfig,
} from "@/server/event-planner/wp-parity/tenant-config";
export type {
  ResolveWpParityEngineConfigInput,
  ResolvedWpParityEngineConfig,
  UnresolvedWpParityEngineConfig,
  WpAttractionKeyMap,
  WpParityEngineConfigResolution,
  WpPricingSource,
  WpTenantParityConfig,
} from "@/server/event-planner/wp-parity/tenant-config";
export {
  WP_PARITY_SNAPSHOT_VERSION,
  snapshotIncompleteWpParity,
  snapshotWpParityResult,
} from "@/server/event-planner/wp-parity/snapshot";
export type {
  WpParityDaySnapshot,
  WpParityInquirySummary,
  WpParityPlanSnapshot,
  WpParitySnapshot,
  WpParitySnapshotContext,
} from "@/server/event-planner/wp-parity/snapshot";
export type {
  ArcadeCard,
  AttractionAnswer,
  AttractionKey,
  DayRecommendation,
  EngineConfig,
  ExtraKey,
  InquiryRaw,
  ItineraryRow,
  LineItem,
  MenuPath,
  Plan,
  PlanDraft,
  RankedPlan,
  RecommendFailure,
  RecommendOptions,
  RecommendResult,
  RecommendSuccess,
  ValidatedInquiry,
  ValidationResult,
} from "@/server/event-planner/wp-parity/types";

/** Build an engine. Defaults: plugin-default catalog, no active custom packages. */
export function createWpParityEngine(config: Partial<EngineConfig> = {}): WpParityEngine {
  return new WpParityEngine({
    catalog: config.catalog ?? wpCatalogDefaults(),
    packages: config.packages ?? [],
  });
}

/** One-shot recommendation with the default (plugin defaults) configuration. */
export function recommendWpParity(
  inquiry: InquiryRaw,
  options: RecommendOptions = {},
  config: Partial<EngineConfig> = {},
): RecommendResult {
  return createWpParityEngine(config).recommend(inquiry, options);
}
