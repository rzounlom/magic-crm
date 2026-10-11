/**
 * R3 — Create a disposable staff inquiry fixture on the local DEV database
 * for authenticated Playwright staff scenarios (read-only by default).
 *
 * Safety:
 * - Refuses MAGICCRM_DATABASE_ROLE=test
 * - Refuses hosts that are not the known Neon DEV branch
 * - Synthetic PII only (r3-staff+…@example.com)
 * - Does not place HOLDs, confirm bookings, or collect payment
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { getPublicEventPlanByToken } from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";

const DEV_HOST_FRAGMENT = "ep-bold-art-avjy5nt4";
const DEFAULT_SLUG = "magiccrm-test-center-b";
const FIXTURE_DIR = path.join("playwright", ".fixtures");

config();
config({ path: ".env.local", override: true });

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test. Browser fixtures target the local DEV app database.");
  }

  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes(DEV_HOST_FRAGMENT)) {
    throw new Error(`Refused: unexpected database host "${host}". Expected Neon DEV (${DEV_HOST_FRAGMENT}).`);
  }

  const slug = (process.env.PLAYWRIGHT_STAFF_ORG_SLUG ?? process.env.PLAYWRIGHT_PUBLIC_ORG_SLUG ?? DEFAULT_SLUG).trim();
  const database = createPrismaClient(env.DATABASE_URL);

  try {
    const organization = await database.organization.findFirst({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
    if (!organization) {
      throw new Error(`Organization slug "${slug}" not found on DEV. Set PLAYWRIGHT_STAFF_ORG_SLUG.`);
    }

    const attractionCount = await database.salesKnowledgeItem.count({
      where: { organizationId: organization.id, active: true, type: "ATTRACTION" },
    });
    if (attractionCount < 3) {
      const location = await database.location.findFirst({
        where: { organizationId: organization.id },
        select: { id: true },
      });
      for (const name of ["R3 Bowling", "R3 Laser Tag", "R3 Arcade"] as const) {
        await database.salesKnowledgeItem.create({
          data: {
            organizationId: organization.id,
            locationId: location?.id,
            type: "ATTRACTION",
            name,
            shortDescription: `${name} (fixture)`,
            details: "Nonproduction R3 staff browser fixture attraction. Safe to delete.",
            priceText: "$10/person",
            durationMinutes: 60,
            maxGuests: 12,
            active: true,
          },
        });
      }
    }

    const limiter = createMemoryRateLimiter();
    const email = `r3-staff+${crypto.randomUUID()}@example.com`;
    const created = await createPublicInquiry(
      database,
      {
        organizationSlug: organization.slug,
        rateLimitKey: `r3-staff:${email}`,
        firstName: "R3",
        lastName: "StaffFixture",
        email,
        eventType: "Birthday Party",
        preferredDate: "2026-11-22",
        startTime: "14:00",
        guestCount: 10,
        guestMix: "mostly_adults",
        desiredDurationMinutes: 120,
        budgetBand: "1500_3000",
        eventGoal: "Celebration",
        diningPreference: "not_sure",
        spacePreference: "semi_private",
        attractionInterestIds: [],
        submissionId: `r3_sub_${crypto.randomUUID()}`,
      },
      undefined,
      limiter,
    );

    const view = await getPublicEventPlanByToken(database, created.publicToken);
    if (view.organizationSlug !== organization.slug) {
      throw new Error("Fixture token resolved to the wrong organization.");
    }

    mkdirSync(FIXTURE_DIR, { recursive: true });
    const outPath = path.join(FIXTURE_DIR, "staff-inquiry.json");
    const payload = {
      createdAt: new Date().toISOString(),
      databaseHost: host,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      inquiryId: created.inquiryId,
      inquiryPath: `/app/inquiries/${created.inquiryId}`,
      publicToken: created.publicToken,
      planCount: view.plans.length,
      email,
      note: "Nonproduction disposable staff fixture. Do not commit. Do not confirm payment.",
    };
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });

    console.info(
      JSON.stringify(
        {
          ok: true,
          outPath,
          organizationSlug: organization.slug,
          inquiryId: created.inquiryId,
          planCount: view.plans.length,
          inquiryPath: payload.inquiryPath,
          exportHint: `export PLAYWRIGHT_STAFF_INQUIRY_FIXTURE="$PWD/${outPath}"`,
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
