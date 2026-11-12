/**
 * Phase 10G — Create a disposable WP inquiry on magiccrm-test-center-b only.
 * Refuses Generations org and test-role database.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { createPublicWpEventInquiry } from "@/server/services/inquiry-service";

config();
config({ path: ".env.local", override: true });

const DEV_HOST = "ep-bold-art-avjy5nt4";
const SYNTHETIC_SLUG = "magiccrm-test-center-b";
const GENERATIONS_ID = "mdutc2nkvpafezukeem8942v";
const OUT = path.join("playwright", ".fixtures", "phase-10g-wp-inquiry.json");

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes(DEV_HOST)) {
    throw new Error(`Refused: unexpected host ${host}`);
  }
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const org = await db.organization.findFirst({
      where: { slug: SYNTHETIC_SLUG },
      select: { id: true, slug: true, onboardingStatus: true },
    });
    if (!org) throw new Error("Synthetic org not found.");
    if (org.id === GENERATIONS_ID) throw new Error("Refused: Generations org.");

    const created = await createPublicWpEventInquiry(
      db,
      {
        organizationSlug: SYNTHETIC_SLUG,
        rateLimitKey: `phase10g:${crypto.randomUUID()}`,
        firstName: "Phase10G",
        lastName: "Synthetic",
        company: "MagicCRM QA",
        phone: "5555550100",
        email: `phase10g+${crypto.randomUUID()}@example.test`,
        eventType: "Corporate or Team Event",
        dates: [futureDate(35)],
        time: "14:00",
        adults: 10,
        children: 0,
        duration: "2 hours",
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
        description: "Phase 10G synthetic WP inquiry for staff quote browser verification.",
        comments: null,
        referral: "Phase10G",
        submissionId: `phase10g_${crypto.randomUUID()}`,
      },
      createMemoryRateLimiter(),
    );

    if (created.organizationSlug !== SYNTHETIC_SLUG) {
      throw new Error("Created inquiry org mismatch — abort.");
    }

    mkdirSync(path.dirname(OUT), { recursive: true });
    const payload = {
      createdAt: new Date().toISOString(),
      organizationId: org.id,
      organizationSlug: created.organizationSlug,
      inquiryId: created.inquiryId,
      inquiryPath: `/app/inquiries/${created.inquiryId}`,
      privateCalculationStatus: created.privateCalculationStatus,
      note: "Synthetic WP inquiry on magiccrm-test-center-b only. Do not use Generations.",
    };
    writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
