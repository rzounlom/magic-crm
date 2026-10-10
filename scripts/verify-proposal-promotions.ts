/**
 * Read-only complete-proposal verification for Generations CRM Test (DEV).
 * Uses persisted catalog + buildCatalogEventPlans. No inquiries/bookings/notifications.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { loadCatalogForProposal } from "@/server/catalog/load-for-proposal";
import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";
import { buildCatalogEventPlans } from "@/server/services/proposal-engine";
import { loadAttractionCompositionInputs } from "@/server/services/event-plan-service";

const TARGET_SLUG = "generations-crm-test-1788129640704833684";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

function summarize(draft: Awaited<ReturnType<typeof buildCatalogEventPlans>>[number]) {
  const lines = (draft.payload.lineItems ?? []).map((row) => ({
    slug: row.slug,
    quantity: row.quantity,
    unitLabel: row.unitLabel ?? null,
    unitPriceCents: row.unitPriceCents,
    totalCents: row.totalCents,
    discountCents: row.discountCents ?? 0,
    originalTotalCents: row.originalTotalCents ?? row.totalCents,
  }));
  const lineSum = lines.reduce((sum, row) => sum + row.totalCents, 0);
  const resources = (draft.payload.resourceRequirements ?? []).map((row) => ({
    productId: row.productId,
    resourceTypeSlug: row.resourceTypeSlug,
    quantity: row.quantity,
    guestBasedQuantity: row.guestBasedQuantity,
  }));
  return {
    tier: draft.tier,
    estimatedTotalCents: draft.estimatedTotalCents,
    lineSumCents: lineSum,
    linesReconcile: lineSum === draft.estimatedTotalCents,
    budgetFit: draft.payload.budgetFit ?? null,
    budgetExplanationCode: draft.payload.budgetExplanationCode ?? null,
    coverageFeasibility: draft.payload.coverageFeasibility ?? null,
    availabilityStatus: draft.availabilityStatus ?? null,
    availabilityValidated: draft.availabilityValidated,
    appliedPromotions: draft.payload.pricingBreakdown?.appliedPromotions ?? [],
    lines,
    resources,
    activities: draft.payload.activities.map((row) => ({
      name: row.name,
      quantity: row.quantity,
      priceCents: row.priceCents,
    })),
    dining: {
      label: draft.payload.dining.label,
      priceCents: draft.payload.dining.priceCents,
    },
    spaces: draft.payload.spaces.map((row) => ({
      name: row.name,
      priceCents: row.priceCents,
    })),
  };
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirstOrThrow({
      where: { slug: TARGET_SLUG },
      select: { id: true, slug: true, currency: true, timezone: true, depositPercent: true },
    });
    const location = await database.location.findFirst({
      where: { organizationId: organization.id },
      select: { id: true, timezone: true },
      orderBy: { createdAt: "asc" },
    });
    const catalog = await loadCatalogForProposal(database, organization.id, location?.id);
    const interests = await database.attractionInterest.findMany({
      where: { organizationId: organization.id, active: true },
      select: { id: true, slug: true },
      orderBy: { displayOrder: "asc" },
    });
    const interestIdBySlug = new Map(interests.map((row) => [row.slug, row.id]));

    const baseFacts = (overrides: Partial<PlannerInquiryFacts>): PlannerInquiryFacts => ({
      eventType: "Birthday Party",
      eventGoal: "Celebration",
      guestCount: 12,
      guestMix: "mostly_adults",
      desiredDurationMinutes: 120,
      desiredDate: "2026-10-14",
      desiredStartTime: "18:00",
      budgetMin: null,
      budgetMax: null,
      diningPreference: "none",
      spacePreference: "no_preference",
      attractionInterestIds: [],
      customerNotes: null,
      ...overrides,
    });

    const run = async (label: string, inquiry: PlannerInquiryFacts, interestSlugs: string[] = []) => {
      const interestIds = interestSlugs
        .map((slug) => interestIdBySlug.get(slug))
        .filter((id): id is string => Boolean(id));
      const attractionInputs = await loadAttractionCompositionInputs(
        database,
        organization.id,
        interestIds,
      );
      const drafts = await buildCatalogEventPlans({
        organizationId: organization.id,
        locationId: location?.id ?? null,
        timeZone: location?.timezone ?? organization.timezone,
        inquiry: { ...inquiry, attractionInterestIds: interestIds },
        products: catalog.products,
        profiles: catalog.profiles,
        resourceRequirements: catalog.resourceRequirements,
        promotions: catalog.promotions,
        categorySlugByProductId: catalog.categorySlugByProductId,
        currency: organization.currency,
        depositPercent: organization.depositPercent,
        attractionSelections: attractionInputs.selections,
        directAttractionProductIds: attractionInputs.directProductIds,
      });
      return {
        label,
        date: inquiry.desiredDate,
        guestCount: inquiry.guestCount,
        interestSlugs,
        tiers: drafts.map(summarize),
        tierCount: drafts.length,
      };
    };

    const bowlingInterest = interestIdBySlug.has("bowling") ? ["bowling"] : [];
    const axeInterest = interestIdBySlug.has("axe-throwing") ? ["axe-throwing"] : [];

    const report = {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      locationId: location?.id ?? null,
      activePromotions: catalog.promotions
        .filter((row) => row.active)
        .map((row) => ({ slug: row.slug, type: row.type, productSlugs: row.productSlugs, daysOfWeek: row.daysOfWeek })),
      bowlingWeekendDays: catalog.products
        .find((row) => row.slug === "bowling-1h")
        ?.prices.find((price) => price.strategy === "PER_LANE_WEEKDAY_WEEKEND")?.weekendDays ?? null,
      grantCount: catalog.products.reduce((sum, row) => sum + (row.experienceGrants?.length ?? 0), 0),
      scenarios: [
        await run("wed_bowling_12", baseFacts({ desiredDate: "2026-10-14" }), bowlingInterest),
        await run(
          "wed_bowling_axe_12",
          baseFacts({ desiredDate: "2026-10-14" }),
          [...bowlingInterest, ...axeInterest],
        ),
        await run(
          "wed_bowling_food_24",
          baseFacts({
            desiredDate: "2026-10-14",
            guestCount: 24,
            diningPreference: "pizza_light",
          }),
          bowlingInterest,
        ),
        await run(
          "wed_bowling_private_12",
          baseFacts({ desiredDate: "2026-10-14", spacePreference: "private" }),
          bowlingInterest,
        ),
        await run(
          "thu_axe_2",
          baseFacts({ desiredDate: "2026-10-15", guestCount: 2, diningPreference: "none" }),
          axeInterest,
        ),
        await run(
          "thu_axe_3",
          baseFacts({ desiredDate: "2026-10-15", guestCount: 3, diningPreference: "none" }),
          axeInterest,
        ),
        await run(
          "thu_axe_5",
          baseFacts({ desiredDate: "2026-10-15", guestCount: 5, diningPreference: "none" }),
          axeInterest,
        ),
        await run(
          "thu_bowling_axe_12",
          baseFacts({ desiredDate: "2026-10-15" }),
          [...bowlingInterest, ...axeInterest],
        ),
        await run(
          "fri_bowling_12",
          baseFacts({ desiredDate: "2026-10-16" }),
          bowlingInterest,
        ),
        await run(
          "fri_bowling_food_12",
          baseFacts({ desiredDate: "2026-10-16", diningPreference: "pizza_light" }),
          bowlingInterest,
        ),
      ],
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
