/**
 * R5 — Create disposable inquiry fixture(s) for HOLD / confirm lifecycle Playwright.
 *
 * Prerequisites: run `scripts/r5-prepare-test-venue.ts` first.
 * Safety: DEV host only; synthetic PII; no HOLD/confirm in this script.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import {
  getPublicEventPlanByToken,
  selectPublicEventPlan,
} from "@/server/services/event-plan-service";
import { createPublicInquiry } from "@/server/services/inquiry-service";

const DEV_HOST_FRAGMENT = "ep-bold-art-avjy5nt4";
const DEFAULT_SLUG = "magiccrm-test-center-b";
const FIXTURE_DIR = path.join("playwright", ".fixtures");

config();
config({ path: ".env.local", override: true });

/** Far-future weekday local date so lifecycle runs do not collide with prior HOLDs/bookings. */
function lifecycleEventDate(offsetDays: number): string {
  const base = new Date(Date.UTC(2027, 0, 12)); // 2027-01-12 Tuesday
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

async function createOne(
  database: ReturnType<typeof createPrismaClient>,
  organization: { id: string; slug: string; name: string },
  attractionIds: string[],
  label: string,
  preferredDate: string,
) {
  const limiter = createMemoryRateLimiter();
  const email = `r5-${label}+${crypto.randomUUID()}@example.com`;
  const created = await createPublicInquiry(
    database,
    {
      organizationSlug: organization.slug,
      rateLimitKey: `r5-${label}:${email}`,
      firstName: "R5",
      lastName: label === "hold" ? "HoldFixture" : "ConfirmFixture",
      email,
      eventType: "Birthday Party",
      preferredDate,
      startTime: "14:00",
      guestCount: 10,
      guestMix: "mostly_adults",
      desiredDurationMinutes: 120,
      budgetBand: "1500_3000",
      eventGoal: "Celebration",
      diningPreference: "not_sure",
      spacePreference: "semi_private",
      attractionInterestIds: attractionIds.slice(0, 2),
      submissionId: `r5_${label}_${crypto.randomUUID()}`,
    },
    undefined,
    limiter,
  );

  const view = await getPublicEventPlanByToken(database, created.publicToken);
  if (view.plans.length === 0) {
    throw new Error(`No plans generated for ${label} fixture.`);
  }
  const selectedPlanId = view.plans[0]!.id;
  await selectPublicEventPlan(
    database,
    {
      token: created.publicToken,
      planId: selectedPlanId,
      rateLimitKey: `r5-${label}-select:${email}`,
    },
    limiter,
  );

  return {
    label,
    inquiryId: created.inquiryId,
    inquiryPath: `/app/inquiries/${created.inquiryId}`,
    publicToken: created.publicToken,
    selectedPlanId,
    planCount: view.plans.length,
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
      select: { id: true, slug: true, name: true },
    });
    if (!organization) {
      throw new Error(`Organization "${slug}" not found. Run r5-prepare-test-venue first.`);
    }

    const attractions = await database.salesKnowledgeItem.findMany({
      where: {
        organizationId: organization.id,
        active: true,
        name: { startsWith: "R5 " },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    if (attractions.length < 2) {
      throw new Error("R5 attractions missing. Run: corepack pnpm test:e2e:staff:r5-venue");
    }

    // Separate days so HOLD and confirm paths never contend for the same inventory window.
    const daySalt = Math.floor(Date.now() / 1000) % 200;
    const hold = await createOne(
      database,
      organization,
      attractions.map((a) => a.id),
      "hold",
      lifecycleEventDate(daySalt),
    );
    const confirm = await createOne(
      database,
      organization,
      attractions.map((a) => a.id),
      "confirm",
      lifecycleEventDate(daySalt + 2),
    );

    mkdirSync(FIXTURE_DIR, { recursive: true });
    const staffPath = path.join(FIXTURE_DIR, "staff-inquiry.json");
    // Default staff fixture points at HOLD inquiry so observation suite stays green.
    writeFileSync(
      staffPath,
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          databaseHost: host,
          organizationSlug: organization.slug,
          organizationName: organization.name,
          inquiryId: hold.inquiryId,
          inquiryPath: hold.inquiryPath,
          publicToken: hold.publicToken,
          planCount: hold.planCount,
          selectedPlanId: hold.selectedPlanId,
          email: hold.email,
          preferredDate: hold.preferredDate,
          note: "R5 lifecycle HOLD fixture (selected plan). Disposable. Do not commit.",
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );

    const lifecyclePath = path.join(FIXTURE_DIR, "r5-lifecycle.json");
    writeFileSync(
      lifecyclePath,
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          databaseHost: host,
          organizationSlug: organization.slug,
          hold,
          confirm,
          note: "Separate HOLD and confirm fixtures. Mutating tests must use PLAYWRIGHT_STAFF_MUTATIONS=1.",
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
          staffPath,
          lifecyclePath,
          holdPath: hold.inquiryPath,
          confirmPath: confirm.inquiryPath,
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
