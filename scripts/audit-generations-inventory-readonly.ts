/**
 * Read-only Generations inventory audit for Phase 8A.
 * Does not create, update, or delete any records.
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/audit-generations-inventory-readonly.ts
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import {
  WP_ATTRACTION_INVENTORY_MAPPINGS,
  WP_PRICING_COMPONENT_CLASSES,
  buildWpDraftResourceRequirements,
} from "@/server/event-planner/wp-parity/inventory-mapping";
import type { AttractionKey } from "@/server/event-planner/wp-parity/types";

const GENERATIONS_ORG_ID = "mdutc2nkvpafezukeem8942v";

config();
config({ path: ".env.local", override: true });

function hostFromDatabaseUrl(url: string): string {
  try {
    return new URL(url.replace(/^postgresql:/, "http:")).host;
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    console.log(
      JSON.stringify(
        {
          mode: "read_only",
          host: hostFromDatabaseUrl(env.DATABASE_URL),
          organizationId: GENERATIONS_ORG_ID,
        },
        null,
        2,
      ),
    );

    const organization = await database.organization.findFirst({
      where: { id: GENERATIONS_ORG_ID },
      select: { id: true, name: true, slug: true, onboardingStatus: true },
    });
    if (!organization) {
      throw new Error(`Organization ${GENERATIONS_ORG_ID} not found on this database.`);
    }

    const locations = await database.location.findMany({
      where: { organizationId: GENERATIONS_ORG_ID },
      select: { id: true, name: true, slug: true, timezone: true, active: true },
      orderBy: { name: "asc" },
    });

    const resourceTypes = await database.resourceType.findMany({
      where: { organizationId: GENERATIONS_ORG_ID },
      orderBy: { slug: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        active: true,
        inventoryConfigured: true,
        schedulingMode: true,
        slotMinutes: true,
        defaultDurationMinutes: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true,
        locationId: true,
        _count: { select: { resources: true } },
      },
    });

    const resources = await database.resource.findMany({
      where: { organizationId: GENERATIONS_ORG_ID },
      orderBy: [{ resourceTypeId: "asc" }, { displayOrder: "asc" }],
      select: {
        id: true,
        name: true,
        active: true,
        capacity: true,
        displayOrder: true,
        locationId: true,
        resourceTypeId: true,
        resourceType: { select: { slug: true, name: true } },
      },
    });

    const productRoomLinks = await database.productResourceRequirement.findMany({
      where: { organizationId: GENERATIONS_ORG_ID },
      select: {
        quantityRule: true,
        quantity: true,
        guestsPerUnit: true,
        durationMinutes: true,
        exclusive: true,
        product: { select: { slug: true, name: true, kind: true, active: true } },
        resourceType: { select: { slug: true, name: true } },
        resource: { select: { id: true, name: true } },
      },
      take: 200,
    });

    type ResourceBucket = {
      slug: string;
      name: string;
      activeUnits: number;
      inactiveUnits: number;
      capacities: Array<number | null>;
      unitNames: string[];
    };
    const resourcesByType = new Map<string, ResourceBucket>();
    for (const row of resources) {
      const key = row.resourceType.slug;
      const bucket = resourcesByType.get(key) ?? {
        slug: key,
        name: row.resourceType.name,
        activeUnits: 0,
        inactiveUnits: 0,
        capacities: [],
        unitNames: [],
      };
      if (row.active) {
        bucket.activeUnits += 1;
      } else {
        bucket.inactiveUnits += 1;
      }
      bucket.capacities.push(row.capacity);
      bucket.unitNames.push(row.name);
      resourcesByType.set(key, bucket);
    }

    const orgResourceTypeRows = resourceTypes.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      inventoryConfigured: row.inventoryConfigured,
      active: row.active,
    }));

    const allAttractions = WP_ATTRACTION_INVENTORY_MAPPINGS.map(
      (row) => row.attraction,
    ) as AttractionKey[];
    const mappingProbe = buildWpDraftResourceRequirements({
      selectedAttractions: allAttractions,
      guestCount: 12,
      durationMinutes: 120,
      resourceTypes: orgResourceTypeRows,
    });

    const attractionCoverage = WP_ATTRACTION_INVENTORY_MAPPINGS.map((mapping) => {
      const matchedSlug = mapping.resourceTypeSlugs.find((slug) =>
        orgResourceTypeRows.some((row) => row.active && row.slug === slug),
      );
      const type = matchedSlug
        ? resourceTypes.find((row) => row.slug === matchedSlug) ?? null
        : null;
      const units = matchedSlug ? resourcesByType.get(matchedSlug) ?? null : null;
      const status = !type
        ? "missing_resource_type"
        : !type.active
          ? "inactive_resource_type"
          : !type.inventoryConfigured || (units?.activeUnits ?? 0) === 0
            ? "type_present_inventory_incomplete"
            : "fully_mapped";
      return {
        attraction: mapping.attraction,
        inventoryClass: mapping.inventoryClass,
        requiresHoldForBooking: mapping.requiresHoldForBooking,
        candidateSlugs: mapping.resourceTypeSlugs,
        matchedSlug: matchedSlug ?? null,
        status,
        resourceType: type
          ? {
              id: type.id,
              slug: type.slug,
              name: type.name,
              active: type.active,
              inventoryConfigured: type.inventoryConfigured,
              schedulingMode: type.schedulingMode,
              slotMinutes: type.slotMinutes,
              defaultDurationMinutes: type.defaultDurationMinutes,
              bufferBeforeMinutes: type.bufferBeforeMinutes,
              bufferAfterMinutes: type.bufferAfterMinutes,
              resourceRowCount: type._count.resources,
            }
          : null,
        units,
      };
    });

    const roomLikeTypes = resourceTypes.filter((row) =>
      /room|skybox|mezzanine|facility|arcade|golf|climb|bowling|axe|laser/i.test(
        `${row.slug} ${row.name}`,
      ),
    );

    console.log(
      JSON.stringify(
        {
          organization,
          locations,
          resourceTypeCount: resourceTypes.length,
          resourceUnitCount: resources.length,
          resourceTypes,
          resourcesByType: [...resourcesByType.values()],
          attractionCoverage,
          mappingProbe: {
            mappedAttractions: mappingProbe.mappedAttractions,
            unmappedReservableAttractions: mappingProbe.unmappedReservableAttractions,
            requirements: mappingProbe.requirements.map((row) => ({
              attraction: row.knowledgeItemId,
              resourceTypeSlug: row.resourceTypeSlug,
              quantity: row.quantity,
              guestsPerUnit: row.guestsPerUnit,
              inventoryConfigured: row.inventoryConfigured,
            })),
          },
          pricingComponentClasses: WP_PRICING_COMPONENT_CLASSES,
          roomLikeTypes: roomLikeTypes.map((row) => ({
            id: row.id,
            slug: row.slug,
            name: row.name,
            active: row.active,
            inventoryConfigured: row.inventoryConfigured,
            resourceRowCount: row._count.resources,
          })),
          productResourceRequirementSample: productRoomLinks.slice(0, 40),
          productResourceRequirementCount: productRoomLinks.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
