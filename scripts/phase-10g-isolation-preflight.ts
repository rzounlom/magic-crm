/**
 * Phase 10G — Read-only isolation preflight before browser writes.
 * Does not print secrets or mutate data.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";

config();
config({ path: ".env.local", override: true });

const GENERATIONS_ORG_ID = "mdutc2nkvpafezukeem8942v";
const SYNTHETIC_SLUG = "magiccrm-test-center-b";
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function main() {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const synthetic = await db.organization.findFirst({
      where: { slug: SYNTHETIC_SLUG },
      select: { id: true, slug: true, name: true },
    });
    const location = synthetic
      ? await db.location.findFirst({
          where: { organizationId: synthetic.id },
          select: { id: true, name: true, slug: true, timezone: true },
        })
      : null;
    const generationsHours = await db.locationOperatingHoursPolicy.count({
      where: { organizationId: GENERATIONS_ORG_ID },
    });

    const checks = {
      clerkPublishableIsTest: pk.startsWith("pk_test_"),
      clerkSecretIsNotLive: !sk.startsWith("sk_live_"),
      baseUrlIsLocalhost: BASE.startsWith("http://localhost:") || BASE.startsWith("http://127.0.0.1:"),
      baseUrlIsNotVercelProduction: !BASE.includes("vercel.app") && !BASE.includes("magic-crm-eta"),
      syntheticOrgPresent: Boolean(synthetic),
      syntheticIsNotGenerations: synthetic?.id !== GENERATIONS_ORG_ID,
      generationsHoursUnchangedUnconfigured: generationsHours === 0,
      databaseRoleNotTestFlag: process.env.MAGICCRM_DATABASE_ROLE !== "test",
      note:
        "Browser E2E uses Clerk TEST + localhost against the MagiCRM customer Neon host with a disposable synthetic org (R3/R5). Writes must stay on that org only.",
    };

    const ok = Object.entries(checks)
      .filter(([key]) => key !== "note" && key !== "databaseRoleNotTestFlag")
      .every(([, value]) => value === true);

    console.log(
      JSON.stringify(
        {
          ok,
          baseUrl: BASE,
          databaseHost: host,
          synthetic,
          syntheticLocation: location,
          generationsHoursPolicyCount: generationsHours,
          checks,
        },
        null,
        2,
      ),
    );
    if (!ok) {
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
