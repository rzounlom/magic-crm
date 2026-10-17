/**
 * R7 — Disposable exclusive-resource fixture for stale-availability Playwright.
 *
 * Creates a 1-unit resource type + attraction (does not reuse shared R5 bowling inventory),
 * then two inquiries for the same far-future date/time that both require that unit.
 *
 * Safety: DEV host only; refuses MAGICCRM_DATABASE_ROLE=test; synthetic PII only.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { resourceTypeSlugFromName } from "@/server/resources/naming";
import {
  getPublicEventPlanByToken,
  selectPublicEventPlan,
} from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import {
  RESOURCE_QUANTITY_RULES,
  RESOURCE_RESERVATION_STATUSES,
  RESOURCE_SCHEDULING_MODES,
} from "@/types/resource-schedule";

const DEV_HOST_FRAGMENT = "ep-bold-art-avjy5nt4";
const DEFAULT_SLUG = "magiccrm-test-center-b";
const FIXTURE_DIR = path.join("playwright", ".fixtures");
const KNOWLEDGE_NAME = "R7 Conflict Suite";
const TYPE_NAME = "R7 Exclusive Suite";

config();
config({ path: ".env.local", override: true });

function conflictEventDate(): string {
  // Far-future Tuesday; offset by day-of-year so re-runs avoid leftover HOLDs.
  const base = new Date(Date.UTC(2027, 8, 14)); // 2027-09-14
  base.setUTCDate(base.getUTCDate() + (Date.now() % 40));
  return base.toISOString().slice(0, 10);
}

async function ensureExclusiveInventory(
  database: ReturnType<typeof createPrismaClient>,
  organization: { id: string },
  location: { id: string },
) {
  let knowledge = await database.salesKnowledgeItem.findFirst({
    where: { organizationId: organization.id, name: KNOWLEDGE_NAME },
  });
  if (!knowledge) {
    knowledge = await database.salesKnowledgeItem.create({
      data: {
        organizationId: organization.id,
        locationId: location.id,
        type: "ATTRACTION",
        name: KNOWLEDGE_NAME,
        shortDescription: "R7 exclusive conflict fixture (synthetic QA)",
        details: "Disposable R7 conflict attraction. Safe to delete.",
        priceText: "$200/event",
        durationMinutes: 60,
        maxGuests: 12,
        active: true,
      },
    });
  }

  const slug = resourceTypeSlugFromName(TYPE_NAME);
  let resourceType = await database.resourceType.findFirst({
    where: { organizationId: organization.id, slug },
  });
  if (!resourceType) {
    resourceType = await database.resourceType.create({
      data: {
        organizationId: organization.id,
        name: TYPE_NAME,
        slug,
        schedulingMode: RESOURCE_SCHEDULING_MODES.SLOTTED,
        slotMinutes: 30,
        defaultDurationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        inventoryConfigured: false,
        active: true,
      },
    });
  }

  const unitCount = await database.resource.count({
    where: { organizationId: organization.id, resourceTypeId: resourceType.id, active: true },
  });
  if (unitCount === 0) {
    await database.resource.create({
      data: {
        organizationId: organization.id,
        locationId: location.id,
        resourceTypeId: resourceType.id,
        name: "R7 Suite 1",
        displayOrder: 1,
        capacity: 12,
        active: true,
        metadata: { notes: "R7 exclusive conflict unit", capacityKind: "per_unit" },
      },
    });
  }

  await database.resourceType.update({
    where: { id: resourceType.id },
    data: { inventoryConfigured: true, active: true },
  });

  // Release any leftover HOLDs on this exclusive unit so fixtures stay deterministic.
  await database.resourceReservation.updateMany({
    where: {
      organizationId: organization.id,
      resource: { resourceTypeId: resourceType.id },
      releasedAt: null,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
    },
    data: { releasedAt: new Date() },
  });

  await database.knowledgeResourceRequirement.upsert({
    where: {
      organizationId_salesKnowledgeItemId_resourceTypeId: {
        organizationId: organization.id,
        salesKnowledgeItemId: knowledge.id,
        resourceTypeId: resourceType.id,
      },
    },
    update: {
      quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
      quantity: 1,
      guestsPerUnit: null,
      durationMinutes: 60,
      requiresStaffConfiguration: false,
      notes: "R7 exclusive conflict requirement",
    },
    create: {
      organizationId: organization.id,
      salesKnowledgeItemId: knowledge.id,
      resourceTypeId: resourceType.id,
      quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
      quantity: 1,
      durationMinutes: 60,
      requiresStaffConfiguration: false,
      notes: "R7 exclusive conflict requirement",
    },
  });

  return { knowledgeId: knowledge.id, resourceTypeId: resourceType.id, resourceTypeSlug: resourceType.slug };
}

async function createInquiry(
  database: ReturnType<typeof createPrismaClient>,
  organization: { id: string; slug: string },
  inventory: { knowledgeId: string; resourceTypeId: string },
  resourceTypeSlug: string,
  label: "winner" | "loser",
  preferredDate: string,
) {
  const limiter = createMemoryRateLimiter();
  const email = `r7-conflict-${label}+${crypto.randomUUID()}@example.com`;
  const created = await createPublicInquiry(
    database,
    {
      organizationSlug: organization.slug,
      rateLimitKey: `r7-conflict-${label}:${email}`,
      firstName: "R7",
      lastName: label === "winner" ? "WinnerFixture" : "LoserFixture",
      email,
      eventType: "Birthday Party",
      preferredDate,
      startTime: "15:00",
      guestCount: 8,
      guestMix: "mostly_adults",
      desiredDurationMinutes: 120,
      budgetBand: "1500_3000",
      eventGoal: "Celebration",
      diningPreference: "not_sure",
      spacePreference: "semi_private",
      attractionInterestIds: [inventory.knowledgeId],
      submissionId: `r7_conflict_${label}_${crypto.randomUUID()}`,
    },
    undefined,
    limiter,
  );

  const view = await getPublicEventPlanByToken(database, created.publicToken);
  if (view.plans.length === 0) {
    throw new Error(`No plans generated for ${label} conflict fixture.`);
  }
  const selectedPlanId = view.plans[0]!.id;
  await selectPublicEventPlan(
    database,
    {
      token: created.publicToken,
      planId: selectedPlanId,
      rateLimitKey: `r7-conflict-${label}-select:${email}`,
    },
    limiter,
  );

  // Pin both inquiries to the exclusive 1-unit suite so they compete deterministically
  // (generated plans may still include shared R5 attractions).
  const plan = await database.eventPlanRecommendation.findFirst({
    where: { id: selectedPlanId, organizationId: organization.id },
  });
  if (!plan) {
    throw new Error(`Selected plan missing for ${label}.`);
  }
  const payload = (plan.payload ?? {}) as Record<string, unknown>;
  await database.eventPlanRecommendation.update({
    where: { id: selectedPlanId },
    data: {
      availabilityStatus: "NOT_VALIDATED",
      availabilityValidated: false,
      durationMinutes: 60,
      guestCount: 8,
      payload: {
        ...payload,
        eventDate: preferredDate,
        startTime: "15:00",
        durationMinutes: 60,
        guestCount: 8,
        pricingComplete: true,
        activities: [
          {
            knowledgeItemId: inventory.knowledgeId,
            name: KNOWLEDGE_NAME,
            quantity: 1,
            priceCents: 20_000,
          },
        ],
        resourceRequirements: [
          {
            knowledgeItemId: inventory.knowledgeId,
            knowledgeItemName: KNOWLEDGE_NAME,
            resourceTypeId: inventory.resourceTypeId,
            resourceTypeSlug,
            resourceTypeName: TYPE_NAME,
            quantityRule: "FIXED",
            quantity: 1,
            guestsPerUnit: null,
            durationMinutes: 60,
            inventoryConfigured: true,
            requiresStaffConfiguration: false,
          },
        ],
      },
    },
  });

  return {
    label,
    inquiryId: created.inquiryId,
    inquiryPath: `/app/inquiries/${created.inquiryId}`,
    selectedPlanId,
    email,
    preferredDate,
  };
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes(DEV_HOST_FRAGMENT)) {
    throw new Error(`Refused: unexpected database host "${host}".`);
  }

  const slug = (process.env.PLAYWRIGHT_STAFF_ORG_SLUG ?? process.env.PLAYWRIGHT_PUBLIC_ORG_SLUG ?? DEFAULT_SLUG).trim();
  const database = createPrismaClient(env.DATABASE_URL);

  try {
    const organization = await database.organization.findFirst({
      where: { slug },
      include: { locations: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (!organization?.locations[0]) {
      throw new Error(`Organization "${slug}" or location missing. Run r5-prepare-test-venue first.`);
    }
    const location = organization.locations[0];
    const inventory = await ensureExclusiveInventory(database, organization, location);
    const preferredDate = conflictEventDate();
    const winner = await createInquiry(
      database,
      organization,
      inventory,
      inventory.resourceTypeSlug,
      "winner",
      preferredDate,
    );
    const loser = await createInquiry(
      database,
      organization,
      inventory,
      inventory.resourceTypeSlug,
      "loser",
      preferredDate,
    );

    mkdirSync(FIXTURE_DIR, { recursive: true });
    const outPath = path.join(FIXTURE_DIR, "r7-conflict.json");
    writeFileSync(
      outPath,
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          databaseHost: host,
          organizationSlug: organization.slug,
          preferredDate,
          startTime: "15:00",
          resourceTypeId: inventory.resourceTypeId,
          knowledgeId: inventory.knowledgeId,
          winner,
          loser,
          note: "R7 exclusive 1-unit conflict fixture. Does not use shared R5 bowling inventory.",
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );

    console.info(
      JSON.stringify(
        {
          ok: true,
          outPath,
          winnerPath: winner.inquiryPath,
          loserPath: loser.inquiryPath,
          preferredDate,
        },
        null,
        2,
      ),
    );
  } finally {
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
