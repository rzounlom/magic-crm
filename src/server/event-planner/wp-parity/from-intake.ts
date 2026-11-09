import type { WpIntakeAnswers } from "@/lib/event-planner/wp-intake-contract";
import {
  recommendWpParity,
  snapshotIncompleteWpParity,
  snapshotWpParityResult,
  resolveWpParityEngineConfig,
  type EngineConfig,
  type InquiryRaw,
  type RecommendOptions,
  type WpParitySnapshot,
  type WpParitySnapshotContext,
  type WpPricingSource,
  type WpTenantParityConfig,
} from "@/server/event-planner/wp-parity";

/** Map stored WP intake answers onto the PHP Engine inquiry shape. */
export function inquiryRawFromWpAnswers(answers: WpIntakeAnswers): InquiryRaw {
  return {
    first_name: answers.firstName,
    last_name: answers.lastName,
    company: answers.company,
    phone: answers.phone,
    email: answers.email,
    event_type: answers.eventType,
    dates: answers.dates,
    time: answers.time,
    adults: answers.adults,
    children: answers.children,
    duration: answers.duration,
    other_hours: answers.otherHours ?? "",
    food: answers.food,
    private_room: answers.privateRoom,
    craft: answers.craft,
    has_budget: answers.hasBudget,
    budget: answers.budgetCents != null ? answers.budgetCents / 100 : "",
    description: answers.description,
    comments: answers.comments ?? "",
    referral: answers.referral,
    attractions: { ...answers.attractions },
  };
}

export type PrivateWpCalculationOutcome = {
  status: "ready" | "failed" | "incomplete";
  rulesVersion: string | null;
  pricingRevision: string | null;
  pricingSource: WpPricingSource;
  organizationId: string | null;
  /** Missing/invalid tenant pricing keys; non-empty only when `status` is `incomplete`. */
  missingKeys: string[];
  summary: string;
  snapshot: WpParitySnapshot | null;
  errorMessage: string | null;
};

const PRICING_SOURCE_SUMMARY_LABEL: Record<
  "plugin_defaults" | "tenant_live" | "approved_plugin_baseline",
  string
> = {
  plugin_defaults: "plugin defaults (testing baseline, not verified live pricing)",
  tenant_live: "tenant live (verified live WordPress pricing pack)",
  approved_plugin_baseline:
    "Generations-approved WordPress plugin baseline (final live-price revalidation pending)",
};

type RunContext = {
  config: Partial<EngineConfig>;
  pricingSource: "plugin_defaults" | "tenant_live" | "approved_plugin_baseline";
  organizationId: string | null;
  /** Provenance overrides for the snapshot; omitted for the legacy plugin-defaults path. */
  snapshotContext: WpParitySnapshotContext;
};

function runCalculation(
  answers: WpIntakeAnswers,
  options: RecommendOptions,
  run: RunContext,
): PrivateWpCalculationOutcome {
  const base = {
    pricingSource: run.pricingSource,
    organizationId: run.organizationId,
    missingKeys: [] as string[],
  };
  const sourceLabel = PRICING_SOURCE_SUMMARY_LABEL[run.pricingSource];
  try {
    const result = recommendWpParity(inquiryRawFromWpAnswers(answers), options, run.config);
    const snapshot = snapshotWpParityResult(result, {
      ...run.snapshotContext,
      pricingSource: run.pricingSource,
      organizationId: run.organizationId,
    });
    if (!snapshot.valid) {
      const errorKeys = Object.keys(snapshot.errors);
      return {
        ...base,
        status: "failed",
        rulesVersion: snapshot.rules_version,
        pricingRevision: null,
        summary: `Private calculation could not validate the inquiry (${errorKeys.join(", ") || "unknown"}).`,
        snapshot,
        errorMessage: Object.values(snapshot.errors).join(" "),
      };
    }
    const main = snapshot.dates[0]?.recommendation;
    const altCount = snapshot.dates.reduce((sum, day) => sum + day.alternatives.length, 0);
    const warningCount = snapshot.dates.reduce(
      (sum, day) =>
        sum +
        day.recommendation.review.length +
        day.alternatives.reduce((inner, alt) => inner + alt.review.length, 0),
      0,
    );
    return {
      ...base,
      status: "ready",
      rulesVersion: snapshot.rules_version,
      pricingRevision: snapshot.pricing_revision,
      summary: main
        ? `${snapshot.dates.length} date(s): main “${main.name}” at $${(main.total_cents / 100).toFixed(2)}` +
          (altCount ? `; ${altCount} alternative(s)` : "") +
          (warningCount ? `; ${warningCount} staff warning(s)` : "") +
          `. Pricing source: ${sourceLabel} (revision ${snapshot.pricing_revision}).`
        : "Private calculation completed with no dated recommendation.",
      snapshot,
      errorMessage: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown calculator error";
    return {
      ...base,
      status: "failed",
      rulesVersion: null,
      pricingRevision: null,
      summary: `Private calculation failed after intake was accepted: ${message}`,
      snapshot: null,
      errorMessage: message,
    };
  }
}

/**
 * Run the private WP-parity calculator for staff using plugin defaults (or a caller-supplied
 * EngineConfig for tests). Always labeled `plugin_defaults`; no organization is recorded.
 * Prefer `calculatePrivateWpRecommendationForOrganization` for production paths.
 * Never creates bookings or public event plans.
 */
export function calculatePrivateWpRecommendation(
  answers: WpIntakeAnswers,
  options: RecommendOptions = {},
  config: Partial<EngineConfig> = {},
): PrivateWpCalculationOutcome {
  return runCalculation(answers, options, {
    config,
    pricingSource: "plugin_defaults",
    organizationId: null,
    snapshotContext: {},
  });
}

export type CalculatePrivateWpForOrganizationInput = {
  organizationId: string;
  tenantConfig?: WpTenantParityConfig | null;
  allowPluginDefaults?: boolean;
  options?: RecommendOptions;
};

/**
 * Tenant-aware private calculation. Resolves pricing via `resolveWpParityEngineConfig`
 * (tenant_live > plugin_defaults) and records `pricingSource` + `organizationId` in the
 * outcome and snapshot. If tenant pricing is requested/required but incomplete, no price is
 * invented: the outcome is `incomplete` with the missing keys listed for hard staff review.
 */
export function calculatePrivateWpRecommendationForOrganization(
  answers: WpIntakeAnswers,
  input: CalculatePrivateWpForOrganizationInput,
): PrivateWpCalculationOutcome {
  const resolution = resolveWpParityEngineConfig({
    organizationId: input.organizationId,
    tenantConfig: input.tenantConfig,
    allowPluginDefaults: input.allowPluginDefaults,
  });
  if (!resolution.ok) {
    const missingList = resolution.missing.join(", ");
    return {
      status: "incomplete",
      rulesVersion: resolution.rulesVersion,
      pricingRevision: resolution.pricingRevision,
      pricingSource: "incomplete",
      organizationId: resolution.organizationId,
      missingKeys: [...resolution.missing],
      summary: `Pricing configuration incomplete — staff review required. Missing: ${missingList}.`,
      snapshot: snapshotIncompleteWpParity({
        organizationId: resolution.organizationId,
        missing: resolution.missing,
        rulesVersion: resolution.rulesVersion,
        pricingRevision: resolution.pricingRevision,
      }),
      errorMessage: null,
    };
  }
  return runCalculation(answers, input.options ?? {}, {
    config: resolution.config,
    pricingSource: resolution.pricingSource,
    organizationId: resolution.organizationId,
    snapshotContext: {
      rulesVersion: resolution.rulesVersion,
      pricingRevision: resolution.pricingRevision,
    },
  });
}
