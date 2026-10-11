/**
 * R5 — Prepare isolated TEST/DEV venue prerequisites for lifecycle Playwright.
 *
 * Safety:
 * - Refuses MAGICCRM_DATABASE_ROLE=test
 * - Refuses hosts that are not the known Neon DEV branch
 * - Targets disposable org slug only (default magiccrm-test-center-b)
 * - Marks operating hours as synthetic QA (approvedByNote)
 * - Does not place HOLDs, confirm bookings, or collect payment
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { resourceTypeSlugFromName } from "@/server/resources/naming";
import { OPERATING_HOURS_VERIFICATION_STATUSES } from "@/types/operating-hours";
import { RESOURCE_QUANTITY_RULES, RESOURCE_SCHEDULING_MODES } from "@/types/resource-schedule";

const DEV_HOST_FRAGMENT = "ep-bold-art-avjy5nt4";
const DEFAULT_SLUG = "magiccrm-test-center-b";
const FIXTURE_DIR = path.join("playwright", ".fixtures");
const SYNTHETIC_HOURS_NOTE =
  "R5 synthetic QA operating hours — NOT real-world venue hours. Disposable TEST/DEV only.";

config();
config({ path: ".env.local", override: true });

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test. R5 venue prep targets the local DEV app database.");
  }

  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes(DEV_HOST_FRAGMENT)) {
    throw new Error(`Refused: unexpected database host "${host}". Expected Neon DEV (${DEV_HOST_FRAGMENT}).`);
  }

  const slug = (process.env.PLAYWRIGHT_STAFF_ORG_SLUG ?? process.env.PLAYWRIGHT_PUBLIC_ORG_SLUG ?? DEFAULT_SLUG).trim();
  if (!slug.includes("test") && !slug.includes("magiccrm-test")) {
    throw new Error(
      `Refused: organization slug "${slug}" does not look like a disposable TEST org. Use magiccrm-test-center-b.`,
    );
  }

  const database = createPrismaClient(env.DATABASE_URL);

  try {
    const organization = await database.organization.findFirst({
      where: { slug },
      include: { locations: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (!organization) {
      throw new Error(`Organization slug "${slug}" not found on DEV.`);
    }
    const location = organization.locations[0];
    if (!location) {
      throw new Error(`Organization "${slug}" has no location.`);
    }

    // Ensure timezone is set for deterministic local windows.
    if (!location.timezone) {
      await database.location.update({
        where: { id: location.id },
        data: { timezone: organization.timezone || "America/Chicago" },
      });
    }
    const timeZone = location.timezone || organization.timezone || "America/Chicago";

    // --- Synthetic operating hours (Sun–Sat 08:00–22:00 local) ---
    const policy = await database.locationOperatingHoursPolicy.upsert({
      where: {
        organizationId_locationId: {
          organizationId: organization.id,
          locationId: location.id,
        },
      },
      update: {
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
        approvedAt: new Date(),
        approvedByNote: SYNTHETIC_HOURS_NOTE,
      },
      create: {
        organizationId: organization.id,
        locationId: location.id,
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
        approvedAt: new Date(),
        approvedByNote: SYNTHETIC_HOURS_NOTE,
      },
    });

    await database.locationOperatingHoursWindow.deleteMany({
      where: { organizationId: organization.id, policyId: policy.id },
    });
    await database.locationOperatingHoursWindow.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        organizationId: organization.id,
        locationId: location.id,
        policyId: policy.id,
        dayOfWeek,
        startMinute: 8 * 60,
        endMinute: 22 * 60,
      })),
    });

    // --- Attractions + resource types + numbered units ---
    const attractionDefs = [
      { knowledgeName: "R5 Bowling", typeName: "Bowling Lane", unitPrefix: "Lane", units: 4 },
      { knowledgeName: "R5 Laser Tag", typeName: "Laser Arena", unitPrefix: "Arena", units: 2 },
      { knowledgeName: "R5 Party Room", typeName: "Party Room", unitPrefix: "Room", units: 2 },
    ] as const;

    const ensuredKnowledge: Array<{ id: string; name: string; resourceTypeId: string }> = [];

    for (const def of attractionDefs) {
      let knowledge = await database.salesKnowledgeItem.findFirst({
        where: { organizationId: organization.id, name: def.knowledgeName },
      });
      if (!knowledge) {
        knowledge = await database.salesKnowledgeItem.create({
          data: {
            organizationId: organization.id,
            locationId: location.id,
            type: "ATTRACTION",
            name: def.knowledgeName,
            shortDescription: `${def.knowledgeName} (R5 synthetic QA)`,
            details: "Nonproduction R5 lifecycle fixture attraction. Safe to delete.",
            priceText: "$15/person",
            durationMinutes: 60,
            maxGuests: 20,
            active: true,
          },
        });
      }

      const slugCandidate = resourceTypeSlugFromName(def.typeName);
      let resourceType = await database.resourceType.findFirst({
        where: { organizationId: organization.id, slug: slugCandidate },
      });
      if (!resourceType) {
        resourceType = await database.resourceType.create({
          data: {
            organizationId: organization.id,
            name: def.typeName,
            slug: slugCandidate,
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

      const existingUnits = await database.resource.count({
        where: { organizationId: organization.id, resourceTypeId: resourceType.id, active: true },
      });
      if (existingUnits < def.units) {
        const toCreate = def.units - existingUnits;
        for (let i = 0; i < toCreate; i += 1) {
          const n = existingUnits + i + 1;
          await database.resource.create({
            data: {
              organizationId: organization.id,
              locationId: location.id,
              resourceTypeId: resourceType.id,
              name: `${def.unitPrefix} ${n}`,
              displayOrder: n,
              capacity: 8,
              active: true,
              metadata: { notes: "R5 synthetic QA unit", capacityKind: "per_unit" },
            },
          });
        }
      }

      // Location-scope schedule/availability to this venue's units.
      await database.resource.updateMany({
        where: {
          organizationId: organization.id,
          resourceTypeId: resourceType.id,
          locationId: null,
        },
        data: { locationId: location.id },
      });

      await database.resourceType.update({
        where: { id: resourceType.id },
        data: { inventoryConfigured: true, active: true },
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
          notes: "R5 synthetic QA requirement",
        },
        create: {
          organizationId: organization.id,
          salesKnowledgeItemId: knowledge.id,
          resourceTypeId: resourceType.id,
          quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
          quantity: 1,
          durationMinutes: 60,
          requiresStaffConfiguration: false,
          notes: "R5 synthetic QA requirement",
        },
      });

      ensuredKnowledge.push({ id: knowledge.id, name: knowledge.name, resourceTypeId: resourceType.id });
    }

    mkdirSync(FIXTURE_DIR, { recursive: true });
    const outPath = path.join(FIXTURE_DIR, "r5-venue.json");
    const payload = {
      createdAt: new Date().toISOString(),
      databaseHost: host,
      organizationSlug: organization.slug,
      organizationId: organization.id,
      locationId: location.id,
      locationName: location.name,
      timeZone,
      operatingHours: {
        policyId: policy.id,
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
        approvedByNote: SYNTHETIC_HOURS_NOTE,
        windows: "Sun–Sat 08:00–22:00 local (synthetic QA)",
      },
      attractions: ensuredKnowledge,
      note: "Nonproduction R5 venue prep. Synthetic hours are not real-world venue hours. Do not commit secrets.",
    };
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });

    console.info(
      JSON.stringify(
        {
          ok: true,
          outPath,
          organizationSlug: organization.slug,
          locationId: location.id,
          timeZone,
          hoursNote: SYNTHETIC_HOURS_NOTE,
          attractionCount: ensuredKnowledge.length,
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
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
