/**
 * Read-only persisted catalog proposal verification for Generations CRM Test.
 * Does not create inquiries, bookings, or notifications.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { loadCatalogForProposal } from "@/server/catalog/load-for-proposal";
import { resolvePrimaryLocationId } from "@/server/locations/primary-location";
import { buildCatalogEventPlans } from "@/server/services/proposal-engine";
import type { PlannerInquiryFacts } from "@/server/event-planner/build-event-plans";

const TARGET_SLUG = "generations-crm-test-1788129640704833684";
const DEV_HOST_FRAGMENT = "ep-bold-art-avjy5nt4";

config();
config({ path: ".env.local", override: true });

function facts(overrides: Partial<PlannerInquiryFacts>): PlannerInquiryFacts {
  return {
    eventType: "Birthday Party",
    eventGoal: "Birthday Party",
    guestCount: 12,
    guestMix: "mostly_adults",
    desiredDurationMinutes: 180,
    desiredDate: "2026-10-13",
    desiredStartTime: "18:00",
    budgetMin: null,
    budgetMax: null,
    diningPreference: "not_sure",
    spacePreference: "no_preference",
    attractionInterestIds: [],
    customerNotes: null,
    ...overrides,
  };
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: test database.");
  }
  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes(DEV_HOST_FRAGMENT)) {
    throw new Error(`Refused: unexpected host "${host}".`);
  }

  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirst({
      where: { slug: TARGET_SLUG },
      select: { id: true, slug: true, depositPercent: true },
    });
    if (!organization) {
      throw new Error("Target organization not found.");
    }
    const locationId = await resolvePrimaryLocationId(database, organization.id);
    const catalog = await loadCatalogForProposal(database, organization.id, locationId);
    const bySlug = new Map(catalog.products.map((row) => [row.slug, row]));
    const id = (slug: string) => {
      const product = bySlug.get(slug);
      if (!product) {
        throw new Error(`Missing product ${slug}`);
      }
      return product.id;
    };

    const scenarios = [
      {
        name: "adult-food-bowling-axe",
        inquiry: facts({
          guestMix: "mostly_adults",
          attractionInterestIds: ["bowling", "axe-throwing"],
        }),
        selections: [
          { interestSlug: "bowling", productIds: [id("bowling-1h")] },
          { interestSlug: "axe-throwing", productIds: [id("axe-throwing-30"), id("axe-throwing-60")] },
        ],
        direct: [] as string[],
      },
      {
        name: "kids-laser-arcade",
        inquiry: facts({
          guestCount: 24,
          guestMix: "mostly_children",
          desiredDate: "2026-10-17",
          attractionInterestIds: ["laser-tag", "arcade"],
        }),
        selections: [
          { interestSlug: "laser-tag", productIds: [id("unlimited-laser-tag-90")] },
          { interestSlug: "arcade", productIds: [id("unlimited-arcade-1h")] },
        ],
        direct: [] as string[],
      },
      {
        name: "mixed-bowling",
        inquiry: facts({
          guestMix: "mixed_ages",
          attractionInterestIds: ["bowling"],
        }),
        selections: [{ interestSlug: "bowling", productIds: [id("bowling-1h")] }],
        direct: [] as string[],
      },
      {
        name: "birthday-no-food-package",
        inquiry: facts({
          guestCount: 10,
          guestMix: "mostly_children",
          diningPreference: "none",
          attractionInterestIds: ["bowling"],
        }),
        selections: [{ interestSlug: "bowling", productIds: [id("bowling-1h")] }],
        direct: [id("have-a-ball-bowling")],
      },
      {
        name: "private-space-bowling",
        inquiry: facts({
          guestMix: "mostly_adults",
          spacePreference: "private",
          attractionInterestIds: ["bowling"],
        }),
        selections: [{ interestSlug: "bowling", productIds: [id("bowling-1h")] }],
        direct: [] as string[],
      },
      {
        name: "large-bowling-96",
        inquiry: facts({
          guestCount: 96,
          guestMix: "mostly_adults",
          diningPreference: "none",
          attractionInterestIds: ["bowling"],
        }),
        selections: [{ interestSlug: "bowling", productIds: [id("bowling-1h")] }],
        direct: [] as string[],
      },
    ];

    const report = [];
    for (const scenario of scenarios) {
      const drafts = await buildCatalogEventPlans({
        organizationId: organization.id,
        inquiry: scenario.inquiry,
        products: catalog.products,
        profiles: catalog.profiles,
        resourceRequirements: catalog.resourceRequirements,
        currency: "USD",
        depositPercent: organization.depositPercent,
        attractionSelections: scenario.selections,
        directAttractionProductIds: scenario.direct,
      });
      report.push({
        scenario: scenario.name,
        optionCount: drafts.length,
        options: drafts.map((draft) => ({
          tier: draft.tier,
          totalCents: draft.estimatedTotalCents,
          durationMinutes: draft.durationMinutes,
          feasibility: draft.payload.coverageFeasibility ?? null,
          availabilityStatus: draft.availabilityStatus,
          availabilityValidated: draft.availabilityValidated,
          bookNowAllowed: draft.payload.coverageFeasibility === "FEASIBLE" || !draft.payload.coverageFeasibility
            ? draft.availabilityStatus !== "UNAVAILABLE" &&
              draft.availabilityStatus !== "NEEDS_ADJUSTMENT" &&
              draft.availabilityStatus !== "AVAILABILITY_CHANGED"
            : false,
          slugs: [...new Set((draft.payload.lineItems ?? []).map((row) => row.slug))],
          resources: (draft.payload.resourceRequirements ?? []).map((row) => ({
            slug: row.resourceTypeSlug,
            demand: row.guestBasedQuantity ?? row.quantity,
            allocation: row.quantity,
            note: row.rotationNote ?? null,
          })),
          entitlements: draft.payload.coverageAssessment?.entitlements ?? [],
        })),
      });
    }

    const grantCount = await database.productExperienceGrant.count({
      where: { organizationId: organization.id },
    });
    console.log(JSON.stringify({ host, organizationId: organization.id, grantCount, report }, null, 2));
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
