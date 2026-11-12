/**
 * Phase 10K — Read-only live pricing revalidation readiness.
 *
 * Does NOT promote finalLivePriceRevalidation, tenant_live, or canDeliver.
 * Does NOT create Production inquiries/quotes/bookings/payments or send email.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import type { WpIntakeAnswers } from "@/lib/event-planner/wp-intake-contract";
import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import {
  WP_CATALOG_VERSION,
  calculatePrivateWpRecommendationForOrganization,
  loadApprovedPluginBaselineRegistry,
  loadWpTenantParityConfig,
  organizationUsesApprovedPluginBaseline,
  tryBuildApprovedPluginBaselineConfig,
  wpCatalogDefaults,
  wpCatalogRevision,
} from "@/server/event-planner/wp-parity";
import { WP_KNOWN_CATALOG_DISCREPANCIES } from "@/server/event-planner/wp-parity/quote-draft";
import { resolveWpCustomerQuoteDeliveryPolicy } from "@/server/event-planner/wp-parity/pricing-verification";
import { OPERATING_HOURS_VERIFICATION_STATUSES } from "@/types/operating-hours";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const ORG_ID = "mdutc2nkvpafezukeem8942v";
const LOCATION_ID = "rysftywo62ve9sao10dk71si";
const POLICY_ID = "s07kml2m6xfiwg8ood8vzc6r";
const DEV_HOST = "ep-bold-art-avjy5nt4";
const OUT = path.join("playwright", ".fixtures", "phase-10k-live-pricing-revalidation-readiness.json");

type FindingClass =
  | "MATCH"
  | "APPROVED_CATALOG_DIFFERENCE"
  | "LIVE_CONFIGURATION_MISMATCH"
  | "UNVERIFIED_MISSING_EVIDENCE";

type Finding = {
  classification: FindingClass;
  rule: string;
  expectedCents: number | null;
  observedCents: number | null;
  sourceEvidence: string;
  operationalImpact: string;
};

function baseAnswers(overrides: Partial<WpIntakeAnswers> = {}): WpIntakeAnswers {
  return {
    firstName: "Phase10K",
    lastName: "Synthetic",
    company: "MagicCRM Readiness",
    phone: "5745550199",
    email: "phase10k-synthetic@example.com",
    eventType: "Corporate or Team Event",
    dates: ["2026-11-18"], // Wednesday
    time: "16:00",
    adults: 12,
    children: 0,
    duration: "3 hours",
    otherHours: null,
    minutes: 180,
    attractions: {
      bowling: "yes",
      axe: "no",
      laser: "no",
      golf: "no",
      climbing: "no",
      arcade: "no",
    },
    food: "no",
    privateRoom: "no",
    craft: "no",
    hasBudget: "no",
    budgetCents: null,
    description: "Phase 10K synthetic non-customer scenario",
    comments: null,
    referral: "Internal",
    ...overrides,
  };
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes(DEV_HOST)) {
    throw new Error(`Refused: unexpected database host ${host}`);
  }

  const registry = loadApprovedPluginBaselineRegistry();
  const usesBaseline = organizationUsesApprovedPluginBaseline(ORG_ID, registry);
  const built = tryBuildApprovedPluginBaselineConfig(ORG_ID);
  const loaded = loadWpTenantParityConfig(ORG_ID);
  const delivery = resolveWpCustomerQuoteDeliveryPolicy({
    status: "ready",
    pricingSource: built?.pricingSource ?? "plugin_defaults",
  });
  const defaults = wpCatalogDefaults();

  const findings: Finding[] = [];

  findings.push({
    classification: "UNVERIFIED_MISSING_EVIDENCE",
    rule: "live_wordpress.gapnext_price_overrides + packages",
    expectedCents: null,
    observedCents: null,
    sourceEvidence:
      "Live site serves generations-event-planner-next on /custom-events/ (planner.js/css ver=1793648419). GAPNext ajax localize present. PHP catalog/admin options are not publicly readable; no live_wordpress export available this phase.",
    operationalImpact:
      "finalLivePriceRevalidation must remain pending. Cannot prove live admin overrides match approved baseline 2026-11-02.",
  });

  findings.push({
    classification: "MATCH",
    rule: "approved_plugin_baseline.registry",
    expectedCents: null,
    observedCents: null,
    sourceEvidence: `registry catalogVersion=${registry.catalogVersion}; finalLivePriceRevalidation=${registry.finalLivePriceRevalidation}; org listed=${usesBaseline}`,
    operationalImpact: "Generations continues on approved_plugin_baseline; delivery stays blocked.",
  });

  // Public marketing vs approved baseline (homepage)
  const marketingComparisons: Array<{
    rule: string;
    marketingLabel: string;
    marketingCents: number;
    baselineCents: number;
  }> = [
    {
      rule: "bowling.hour_weekday",
      marketingLabel: "Homepage 1hr Tues-Thu $30.00",
      marketingCents: 3000,
      baselineCents: defaults.bowling.hour_weekday,
    },
    {
      rule: "bowling.hour_weekend",
      marketingLabel: "Homepage 1hr Fri-Sun $40.00",
      marketingCents: 4000,
      baselineCents: defaults.bowling.hour_weekend,
    },
    {
      rule: "bowling.half_weekday",
      marketingLabel: "Homepage half Tues-Thu $17.50",
      marketingCents: 1750,
      baselineCents: defaults.bowling.half_weekday,
    },
    {
      rule: "bowling.shoes",
      marketingLabel: "Homepage Shoe rental $4.00 +tax",
      marketingCents: 400,
      baselineCents: defaults.bowling.shoes,
    },
    {
      rule: "axe.hour",
      marketingLabel: "Homepage Axe $30.00 / person / hour",
      marketingCents: 3000,
      baselineCents: defaults.axe.hour,
    },
    {
      rule: "laser.game",
      marketingLabel: "Homepage Laser $8.00 / person / game",
      marketingCents: 800,
      baselineCents: defaults.laser.game,
    },
    {
      rule: "golf.adult",
      marketingLabel: "Homepage Golf $10.00 per Adult",
      marketingCents: 1000,
      baselineCents: defaults.golf.adult,
    },
    {
      rule: "golf.child",
      marketingLabel: "Homepage Golf $8.00 per child",
      marketingCents: 800,
      baselineCents: defaults.golf.child,
    },
  ];

  for (const row of marketingComparisons) {
    if (row.marketingCents === row.baselineCents) {
      findings.push({
        classification: "MATCH",
        rule: row.rule,
        expectedCents: row.baselineCents,
        observedCents: row.marketingCents,
        sourceEvidence: `${row.marketingLabel} vs approved baseline ${row.baselineCents}¢`,
        operationalImpact: "Public marketing aligns with approved plugin baseline for this rate.",
      });
    } else {
      findings.push({
        classification: "LIVE_CONFIGURATION_MISMATCH",
        rule: row.rule,
        expectedCents: row.baselineCents,
        observedCents: row.marketingCents,
        sourceEvidence: `${row.marketingLabel} vs approved baseline ${row.baselineCents}¢ (plugin defaults / approved pack)`,
        operationalImpact:
          "Marketing page differs from approved Event Planner baseline. Live gapnext catalog value for this key remains unverified without WP admin export.",
      });
    }
  }

  for (const known of WP_KNOWN_CATALOG_DISCREPANCIES) {
    findings.push({
      classification: "APPROVED_CATALOG_DIFFERENCE",
      rule: known.wpKey,
      expectedCents: known.wpCents,
      observedCents: known.magicCatalogCents,
      sourceEvidence: `Option A: WP baseline ${known.wpCents}¢ vs MagiCRM catalog SKU ${known.productSlug} ${known.magicCatalogCents}¢`,
      operationalImpact:
        "Accepted under Option A. WP-derived quotes use baseline cents; MagiCRM catalog left unchanged. Not a reason to overwrite catalog.",
    });
  }

  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { id: ORG_ID },
      select: {
        id: true,
        slug: true,
        customerFacingName: true,
        depositPercent: true,
      },
    });
    if (!organization) throw new Error("Generations org missing");

    const salad = await database.product.findFirst({
      where: { organizationId: ORG_ID, slug: "salad-pan", active: true },
      select: {
        id: true,
        slug: true,
        prices: {
          where: { active: true },
          select: { amountCents: true, additionalHourCents: true },
          take: 1,
        },
      },
    });
    const lowerRoom = await database.product.findFirst({
      where: { organizationId: ORG_ID, slug: "lower-event-room", active: true },
      select: {
        id: true,
        slug: true,
        prices: {
          where: { active: true },
          select: { amountCents: true, additionalHourCents: true },
          take: 1,
        },
      },
    });
    const saladCents = salad?.prices[0]?.amountCents ?? null;
    const lowerBaseCents = lowerRoom?.prices[0]?.amountCents ?? null;
    const lowerExtraCents = lowerRoom?.prices[0]?.additionalHourCents ?? null;

    findings.push({
      classification:
        saladCents === 1999 ? "APPROVED_CATALOG_DIFFERENCE" : "LIVE_CONFIGURATION_MISMATCH",
      rule: "production.catalog.salad-pan",
      expectedCents: 1999,
      observedCents: saladCents,
      sourceEvidence: `Production product salad-pan amountCents=${saladCents ?? "missing"} (WP baseline food.salad=2499)`,
      operationalImpact: "Catalog remains MagiCRM seed; WP quotes retain 2499¢ under Option A.",
    });
    findings.push({
      classification:
        lowerExtraCents === 5000
          ? "APPROVED_CATALOG_DIFFERENCE"
          : "LIVE_CONFIGURATION_MISMATCH",
      rule: "production.catalog.lower-event-room.additionalHourCents",
      expectedCents: 5000,
      observedCents: lowerExtraCents,
      sourceEvidence: `Production lower-event-room additionalHourCents=${lowerExtraCents ?? "missing"} (WP baseline rooms.lower_extra=7500)`,
      operationalImpact: "Catalog remains MagiCRM seed; WP quotes retain 7500¢ under Option A.",
    });

    const hoursPolicy = await database.locationOperatingHoursPolicy.findFirst({
      where: { id: POLICY_ID, organizationId: ORG_ID, locationId: LOCATION_ID },
      select: { id: true, verificationStatus: true, approvedAt: true },
    });

    if (!loaded.ok) {
      throw new Error(`Approved baseline pack failed to load: ${loaded.reason}`);
    }

    const scenarios = [
      {
        id: "bowling_only_weekday",
        answers: baseAnswers(),
      },
      {
        id: "bowling_food_salad_room",
        answers: baseAnswers({
          food: "yes",
          privateRoom: "yes",
          attractions: {
            bowling: "yes",
            axe: "no",
            laser: "no",
            golf: "no",
            climbing: "no",
            arcade: "no",
          },
        }),
      },
      {
        id: "axe_laser_golf_weekend",
        answers: baseAnswers({
          dates: ["2026-11-21"], // Saturday
          time: "14:00",
          attractions: {
            bowling: "no",
            axe: "yes",
            laser: "yes",
            golf: "yes",
            climbing: "no",
            arcade: "no",
          },
        }),
      },
      {
        id: "climbing_arcade_food",
        answers: baseAnswers({
          food: "yes",
          attractions: {
            bowling: "no",
            axe: "no",
            laser: "no",
            golf: "no",
            climbing: "yes",
            arcade: "yes",
          },
        }),
      },
    ] as const;

    const syntheticParity = scenarios.map((scenario) => {
      const outcome = calculatePrivateWpRecommendationForOrganization(scenario.answers, {
        organizationId: ORG_ID,
        tenantConfig: loaded.tenantConfig,
        allowPluginDefaults: true,
      });
      const snapshot = outcome.snapshot?.valid ? outcome.snapshot : null;
      const main = snapshot?.dates[0]?.recommendation;
      return {
        id: scenario.id,
        status: outcome.status,
        pricingSource: outcome.pricingSource,
        rulesVersion: outcome.rulesVersion ?? snapshot?.rules_version ?? null,
        pricingRevision: outcome.pricingRevision,
        mainPlanName: main?.name ?? null,
        totalCents: main?.total_cents ?? null,
        taxCents: main?.tax_cents ?? null,
        subtotalCents: main?.subtotal_cents ?? null,
        errorMessage: outcome.errorMessage,
        valid: snapshot?.valid ?? false,
        pass:
          outcome.status === "ready" &&
          outcome.pricingSource === "approved_plugin_baseline" &&
          Boolean(snapshot?.valid) &&
          (outcome.rulesVersion ?? snapshot?.rules_version) === WP_CATALOG_VERSION &&
          typeof main?.total_cents === "number",
      };
    });

    const payload = {
      ok:
        usesBaseline &&
        registry.finalLivePriceRevalidation === "pending" &&
        delivery.canDeliver === false &&
        organization.depositPercent === 25 &&
        hoursPolicy?.verificationStatus === OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED &&
        syntheticParity.every((row) => row.pass) &&
        saladCents === 1999 &&
        lowerExtraCents === 5000,
      readOnly: true,
      productionWrites: false,
      pricingPromotionExecuted: false,
      databaseHost: host,
      liveWordPressEvidence: {
        site: "https://generations-adventureplex.com/custom-events/",
        pluginSlugObserved: "generations-event-planner-next",
        assetCacheBuster: "1793648419",
        gapNextAjaxLocalized: true,
        publicPhpCatalogReadable: false,
        liveWordpressExportAvailable: false,
        exactPluginSemverFromLiveAssets: null,
        conclusion:
          "Plugin is actively deployed on the live Generations site, but exact plugin semver and live admin overrides/packages cannot be confirmed without WP Admin export (magiccrm-gapnext-pricing-export).",
      },
      approvedBaseline: {
        catalogVersion: registry.catalogVersion,
        source: built?.pricingSource ?? null,
        revision: built
          ? `${wpCatalogRevision(built.catalog)}:approved_plugin_baseline`
          : null,
        finalLivePriceRevalidation: registry.finalLivePriceRevalidation,
        packagesEmpty: built?.packages.length === 0,
        saladCents: defaults.food.salad,
        lowerExtraCents: defaults.rooms.lower_extra,
        shoesCents: defaults.bowling.shoes,
        foodBeverageTaxRate: 0.07,
      },
      organization: {
        id: organization.id,
        slug: organization.slug,
        customerFacingName: organization.customerFacingName,
        depositPercent: organization.depositPercent,
      },
      productionCatalogSpotChecks: {
        saladPanCents: saladCents,
        lowerEventRoomBaseCents: lowerBaseCents,
        lowerEventRoomAdditionalHourCents: lowerExtraCents,
      },
      operatingHoursUnchanged: {
        policyId: hoursPolicy?.id ?? null,
        status: hoursPolicy?.verificationStatus ?? null,
        approvedAt: hoursPolicy?.approvedAt ?? null,
      },
      deliveryGate: {
        canApprove: delivery.canApprove,
        canDeliver: delivery.canDeliver,
        code: delivery.code,
      },
      syntheticParity,
      findings,
      findingCounts: {
        MATCH: findings.filter((f) => f.classification === "MATCH").length,
        APPROVED_CATALOG_DIFFERENCE: findings.filter(
          (f) => f.classification === "APPROVED_CATALOG_DIFFERENCE",
        ).length,
        LIVE_CONFIGURATION_MISMATCH: findings.filter(
          (f) => f.classification === "LIVE_CONFIGURATION_MISMATCH",
        ).length,
        UNVERIFIED_MISSING_EVIDENCE: findings.filter(
          (f) => f.classification === "UNVERIFIED_MISSING_EVIDENCE",
        ).length,
      },
      blocker:
        "Final live price revalidation is BLOCKED until an authoritative live_wordpress export (or owner-attested WP Admin screenshot of gapnext overrides/packages + plugin 3.3.0) confirms live rules match approved baseline 2026-11-02.",
      exactOwnerDecisionRequiredBeforePromotion:
        "Authorize Phase 10L only after reviewing a live WordPress effective-pricing export for Generations: (1) confirm plugin version/rules match or document deltas, (2) set finalLivePriceRevalidation=complete if matched, (3) optionally promote pricingSource to tenant_live from that export, (4) separately authorize canDeliver=true / email / card payments — none of which are authorized by Phase 10K.",
    };

    writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(JSON.stringify(payload, null, 2));
    if (!payload.ok) process.exitCode = 1;
  } finally {
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
