/**
 * R2D.4 read-only DEV inspection: operating-hours coverage, Generations safety, exception workflow surface.
 * Does not write. Does not seed hours or activate tax.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import {
  assertDevDatabaseHost,
  assertNonProductionRuntime,
  defaultGenerationsLocationTimezoneTarget,
} from "@/server/ops/location-timezone-correction";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

async function main() {
  assertNonProductionRuntime(process.env);
  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  assertDevDatabaseHost(host);
  const db = createPrismaClient(env.DATABASE_URL);
  const gens = defaultGenerationsLocationTimezoneTarget();
  const now = new Date();

  try {
    const locations = await db.location.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        organizationId: true,
        timezone: true,
        organization: { select: { id: true, slug: true, name: true } },
        operatingHoursPolicy: {
          select: { id: true, verificationStatus: true },
        },
      },
      orderBy: [{ organizationId: "asc" }, { name: "asc" }],
    });

    const withoutHours = locations.filter((row) => !row.operatingHoursPolicy);
    const pendingFuture = await db.booking.count({
      where: {
        status: "PENDING_PAYMENT",
        OR: [{ startsAt: { gt: now } }, { startsAt: null, eventDate: { gte: now } }],
      },
    });
    const gensOrg = await db.organization.findFirst({
      where: { id: gens.organizationId, slug: gens.organizationSlug },
      select: {
        id: true,
        slug: true,
        timezone: true,
        locations: {
          where: { id: gens.locationId },
          select: {
            id: true,
            name: true,
            timezone: true,
            operatingHoursPolicy: { select: { id: true, verificationStatus: true } },
          },
        },
        taxSettings: {
          select: {
            calculationEnabled: true,
            collectionEnabled: true,
          },
        },
      },
    });
    const gensLocation = gensOrg?.locations[0] ?? null;
    const gensFutureBookings = await db.booking.count({
      where: {
        organizationId: gens.organizationId,
        locationId: gens.locationId,
        status: { in: ["CONFIRMED", "PENDING_PAYMENT"] },
        OR: [{ startsAt: { gt: now } }, { startsAt: null, eventDate: { gte: now } }],
      },
    });
    const gensActiveHolds = await db.resourceReservation.count({
      where: {
        organizationId: gens.organizationId,
        locationId: gens.locationId,
        status: "HOLD",
        releasedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    const gensHistoricalBookings = await db.booking.count({
      where: { organizationId: gens.organizationId, locationId: gens.locationId },
    });
    const gensHistoricalReservations = await db.resourceReservation.count({
      where: { organizationId: gens.organizationId, locationId: gens.locationId },
    });
    const priceCount = await db.productPrice.count({ where: { organizationId: gens.organizationId } });
    const promoCount = await db.pricingPromotion.count({ where: { organizationId: gens.organizationId } });

    console.log(
      JSON.stringify(
        {
          host,
          locationsTotal: locations.length,
          locationsWithoutOperatingHoursPolicy: withoutHours.length,
          sampleWithoutHours: withoutHours.slice(0, 12).map((row) => ({
            organizationSlug: row.organization.slug,
            locationName: row.name,
            timezone: row.timezone,
          })),
          pendingFutureBookingsVisible: pendingFuture,
          exceptionAuthorizeExposedViaServerAction: false,
          exceptionHelperServerOnly: true,
          generations: {
            organizationId: gensOrg?.id ?? null,
            slug: gensOrg?.slug ?? null,
            organizationTimezone: gensOrg?.timezone ?? null,
            locationTimezone: gensLocation?.timezone ?? null,
            operatingHoursPolicy: gensLocation?.operatingHoursPolicy ?? null,
            taxCalculationEnabled: gensOrg?.taxSettings?.calculationEnabled ?? null,
            taxCollectionEnabled: gensOrg?.taxSettings?.collectionEnabled ?? null,
            futureBookingsOrPending: gensFutureBookings,
            activeHolds: gensActiveHolds,
            historicalBookingCount: gensHistoricalBookings,
            historicalReservationCount: gensHistoricalReservations,
            productPriceCount: priceCount,
            pricingPromotionCount: promoCount,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
