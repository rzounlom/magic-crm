/**
 * R1 — Create a disposable public proposal token on the local DEV database
 * for non-mutating `/plan/[token]` browser smoke.
 *
 * Safety:
 * - Refuses MAGICCRM_DATABASE_ROLE=test (use integration fixtures there)
 * - Refuses hosts that are not the known Neon DEV branch
 * - Creates synthetic PII only (r1-fixture+…@example.com)
 * - Does not confirm bookings or collect payment
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

  const slug = (process.env.PLAYWRIGHT_PUBLIC_ORG_SLUG ?? DEFAULT_SLUG).trim();
  const organization = await (async () => {
    const database = createPrismaClient(env.DATABASE_URL);
    try {
      return await database.organization.findFirst({
        where: { slug },
        select: { id: true, slug: true, name: true },
      });
    } finally {
      await database.$disconnect();
    }
  })();

  if (!organization) {
    throw new Error(`Organization slug "${slug}" not found on DEV. Set PLAYWRIGHT_PUBLIC_ORG_SLUG to a non-production org.`);
  }

  const database = createPrismaClient(env.DATABASE_URL);
  const limiter = createMemoryRateLimiter();
  const email = `r1-fixture+${crypto.randomUUID()}@example.com`;

  try {
    const attractionCount = await database.salesKnowledgeItem.count({
      where: { organizationId: organization.id, active: true, type: "ATTRACTION" },
    });
    if (attractionCount < 3) {
      const location = await database.location.findFirst({
        where: { organizationId: organization.id },
        select: { id: true },
      });
      for (const name of ["R1 Bowling", "R1 Laser Tag", "R1 Mini Golf"] as const) {
        await database.salesKnowledgeItem.create({
          data: {
            organizationId: organization.id,
            locationId: location?.id,
            type: "ATTRACTION",
            name,
            shortDescription: `${name} (fixture)`,
            details: "Nonproduction R1 browser fixture attraction. Safe to delete.",
            priceText: "$10/person",
            durationMinutes: 60,
            maxGuests: 12,
            active: true,
          },
        });
      }
      console.info(
        JSON.stringify({
          scope: "magiccrm.r1",
          event: "seeded_fixture_attractions",
          organizationSlug: organization.slug,
          added: 3,
        }),
      );
    }

    const created = await createPublicInquiry(
      database,
      {
        organizationSlug: organization.slug,
        rateLimitKey: `r1-fixture:${email}`,
        firstName: "R1",
        lastName: "Fixture",
        email,
        eventType: "Birthday Party",
        preferredDate: "2026-11-15",
        startTime: "18:00",
        guestCount: 12,
        guestMix: "mixed_ages",
        desiredDurationMinutes: 180,
        budgetBand: "1500_3000",
        eventGoal: "Celebration",
        diningPreference: "not_sure",
        spacePreference: "semi_private",
        attractionInterestIds: [],
        submissionId: `r1_sub_${crypto.randomUUID()}`,
      },
      undefined,
      limiter,
    );

    const view = await getPublicEventPlanByToken(database, created.publicToken);
    if (view.organizationSlug !== organization.slug) {
      throw new Error("Fixture token resolved to the wrong organization.");
    }
    const planCount = view.plans.length;
    if (planCount < 1) {
      throw new Error(
        `Inquiry created but no recommendation plans were generated for "${organization.slug}". Seed sales knowledge / catalog on this DEV tenant first.`,
      );
    }

    mkdirSync(FIXTURE_DIR, { recursive: true });
    const outPath = path.join(FIXTURE_DIR, "proposal.json");
    const payload = {
      createdAt: new Date().toISOString(),
      databaseHost: host,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      inquiryId: created.inquiryId,
      publicToken: created.publicToken,
      planPath: `/plan/${created.publicToken}`,
      planCount,
      note: "Nonproduction disposable fixture. Do not commit. Do not use in production.",
    };
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });

    console.info(
      JSON.stringify(
        {
          ok: true,
          outPath,
          organizationSlug: organization.slug,
          planCount,
          exportHint: `export PLAYWRIGHT_PUBLIC_PLAN_TOKEN='${created.publicToken}'`,
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
