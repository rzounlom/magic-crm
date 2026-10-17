/**
 * Explicit, opt-in provisioning of the Scenario Lab database identity sentinel.
 *
 * Never run against an unknown database. Never auto-seed from application boot.
 *
 * Usage:
 *   MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test \
 *   MAGICCRM_DATABASE_ENVIRONMENT_TOKEN=<token> \
 *   DATABASE_URL=<scenario-lab-db> \
 *   pnpm exec tsx --tsconfig tsconfig.json scripts/provision-scenario-lab-database-identity.ts \
 *     --confirm-nonproduction \
 *     --label "Scenario Lab TEST"
 */

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import {
  SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID,
  SCENARIO_LAB_DATABASE_KINDS,
} from "@/lib/env/scenario-lab-config";

if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
  config({ path: ".env.test", override: true });
} else if (process.env.MAGICCRM_DEPLOYMENT_KIND === "scenario_lab_test") {
  // Prefer isolated Scenario Lab env; do not fall back to DEV URLs.
  config({ path: ".env.scenario-lab.local", override: true });
} else {
  config();
  config({ path: ".env.local", override: true });
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function fail(message: string): never {
  throw new Error(`[scenario-lab] ${message}`);
}

async function main() {
  if (!hasFlag("--confirm-nonproduction")) {
    fail("Refusing to provision without --confirm-nonproduction");
  }

  if (process.env.MAGICCRM_DEPLOYMENT_KIND === "customer_production") {
    fail("Refusing to provision when MAGICCRM_DEPLOYMENT_KIND=customer_production");
  }

  if (process.env.MAGICCRM_DEPLOYMENT_KIND !== "scenario_lab_test") {
    fail("MAGICCRM_DEPLOYMENT_KIND must be scenario_lab_test for identity provisioning");
  }

  const token = process.env.MAGICCRM_DATABASE_ENVIRONMENT_TOKEN?.trim();
  if (!token || token.length < 16) {
    fail("MAGICCRM_DATABASE_ENVIRONMENT_TOKEN must be set (min 16 characters)");
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    fail("DATABASE_URL is required");
  }

  const label = (arg("--label") ?? "Scenario Lab TEST").trim();
  if (!label || label.length > 80) {
    fail("--label is required and must be at most 80 characters");
  }

  const kind = SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST;
  const db = createPrismaClient(databaseUrl);

  try {
    const rows = await db.$queryRaw<Array<{ current_database: string }>>`
      SELECT current_database()::text AS current_database
    `;
    const currentDatabase = rows[0]?.current_database;
    console.info(
      `[scenario-lab] provisioning identity kind=${kind} database=${currentDatabase} label=${label}`,
    );

    await db.databaseEnvironmentIdentity.upsert({
      where: { id: SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID },
      create: {
        id: SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID,
        kind,
        token,
        label,
      },
      update: {
        kind,
        token,
        label,
      },
    });

    console.info("[scenario-lab] database environment identity provisioned");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
