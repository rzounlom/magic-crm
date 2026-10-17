/**
 * Scenario Lab synthetic venue seed (TEST only).
 *
 * Default: dry-run summary (no writes).
 * Apply:   pnpm scenario-lab:seed -- --confirm SEED
 *
 * Uses .env.scenario-lab.local via isolated loader. Refuses DEV / integration TEST.
 */

import { createRequire } from "node:module";
import { createClerkClient } from "@clerk/backend";

import { createPrismaClient } from "@/lib/db/create-client";
import {
  parseScenarioLabConfig,
  SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID,
  SCENARIO_LAB_DATABASE_KINDS,
} from "@/lib/env/scenario-lab-config";
import {
  assertScenarioLabSeedEndpoint,
  SCENARIO_LAB_SEED_EXPECTED_ENDPOINT,
  SCENARIO_LAB_SEED_ORG_NAME,
  SCENARIO_LAB_SEED_ORG_SLUG,
  SCENARIO_LAB_SEED_SYNTHETIC_CONTACT,
} from "@/server/scenario-lab/synthetic-venue-constants";
import {
  applySyntheticVenueSeed,
  dryRunSyntheticVenueSeed,
} from "@/server/scenario-lab/synthetic-venue-seed";

const require = createRequire(import.meta.url);
const { loadScenarioLabEnv } = require("./load-scenario-lab-env.mjs") as {
  loadScenarioLabEnv: () => {
    env: NodeJS.Dict<string>;
    identity: string;
    pooled: { host: string; endpoint: string; database: string };
    direct: { host: string; endpoint: string; database: string };
  };
};

function hasConfirmSeed(): boolean {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const index = argv.indexOf("--confirm");
  return index >= 0 && argv[index + 1] === "SEED";
}

async function assertLabDatabaseReady(
  database: ReturnType<typeof createPrismaClient>,
  env: NodeJS.Dict<string>,
) {
  const dbRows = await database.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()::text AS current_database
  `;
  const currentDatabase = dbRows[0]?.current_database?.trim();
  const expectedName = new URL(String(env.DATABASE_URL).trim()).pathname.replace(/^\//, "");
  if (!currentDatabase || decodeURIComponent(expectedName) !== currentDatabase) {
    throw new Error(
      `[scenario-lab] DATABASE_URL database name does not match active connection (${currentDatabase ?? "unknown"}).`,
    );
  }

  const identity = await database.databaseEnvironmentIdentity.findUnique({
    where: { id: SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID },
    select: { id: true, kind: true, token: true, label: true },
  });
  if (!identity) {
    throw new Error("[scenario-lab] database_environment_identity sentinel is missing.");
  }
  if (identity.kind !== SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST) {
    throw new Error(`[scenario-lab] Unexpected identity kind: ${identity.kind}`);
  }
  const configuredToken = String(env.MAGICCRM_DATABASE_ENVIRONMENT_TOKEN ?? "").trim();
  if (!configuredToken || identity.token !== configuredToken) {
    throw new Error("[scenario-lab] Database identity token does not match configured token.");
  }

  const migrationRows = await database.$queryRaw<Array<{ finished: bigint }>>`
    SELECT COUNT(*) FILTER (WHERE finished_at IS NOT NULL)::bigint AS finished
    FROM _prisma_migrations
  `;
  const finished = Number(migrationRows[0]?.finished ?? 0);
  if (finished !== 30) {
    throw new Error(
      `[scenario-lab] Refusing seed: expected 30 finished migrations, found ${finished}.`,
    );
  }

  return identity.label;
}

async function assertClerkTrustedOrg(config: {
  clerkSecretKey: string;
  trustedClerkOrganizationId: string;
  allowedClerkUserIds: readonly [string, string];
}) {
  const clerk = createClerkClient({ secretKey: config.clerkSecretKey });
  let organization;
  try {
    organization = await clerk.organizations.getOrganization({
      organizationId: config.trustedClerkOrganizationId,
    });
  } catch {
    throw new Error(
      `[scenario-lab] Trusted Clerk organization ${config.trustedClerkOrganizationId} was not found in Clerk TEST.`,
    );
  }

  const memberships = await clerk.organizations.getOrganizationMembershipList({
    organizationId: config.trustedClerkOrganizationId,
    limit: 100,
  });
  const memberUserIds = new Set(
    memberships.data
      .map((row) => row.publicUserData?.userId)
      .filter((id): id is string => Boolean(id)),
  );

  for (const userId of config.allowedClerkUserIds) {
    if (!memberUserIds.has(userId)) {
      throw new Error(
        `[scenario-lab] Allowlisted Clerk user ${userId} is not a member of trusted org ${config.trustedClerkOrganizationId}.`,
      );
    }
  }

  return {
    clerkOrganizationName: organization.name,
    membershipCount: memberships.data.length,
  };
}

function printPlan(items: Array<{ entity: string; key: string; action: string; detail: string }>) {
  console.info("");
  console.info("=== Proposed seed records ===");
  for (const item of items) {
    const key =
      item.entity === "user_profile" && item.key.startsWith("user_")
        ? "user_…(allowlisted)"
        : item.key;
    const detail = item.detail.replace(/user_[A-Za-z0-9]+/g, "user_…");
    console.info(`- [${item.action}] ${item.entity}:${key} — ${detail}`);
  }
  console.info("");
  console.info("Synthetic contact (documented only; Location has no address columns):");
  console.info(
    `  ${SCENARIO_LAB_SEED_SYNTHETIC_CONTACT.addressLine1}, ${SCENARIO_LAB_SEED_SYNTHETIC_CONTACT.city}, ${SCENARIO_LAB_SEED_SYNTHETIC_CONTACT.region} ${SCENARIO_LAB_SEED_SYNTHETIC_CONTACT.postalCode}`,
  );
  console.info(
    `  ${SCENARIO_LAB_SEED_SYNTHETIC_CONTACT.phone} / ${SCENARIO_LAB_SEED_SYNTHETIC_CONTACT.email}`,
  );
}

async function main() {
  const loaded = loadScenarioLabEnv();
  assertScenarioLabSeedEndpoint(loaded.identity, SCENARIO_LAB_SEED_EXPECTED_ENDPOINT);
  if (!loaded.pooled.endpoint.includes(SCENARIO_LAB_SEED_EXPECTED_ENDPOINT)) {
    throw new Error("[scenario-lab] Pooled endpoint mismatch");
  }
  if (!loaded.direct.endpoint.includes(SCENARIO_LAB_SEED_EXPECTED_ENDPOINT)) {
    throw new Error("[scenario-lab] Direct endpoint mismatch");
  }

  const parsed = parseScenarioLabConfig(loaded.env);
  if (!parsed.ok || !parsed.enabled) {
    throw new Error(
      `[scenario-lab] ${parsed.ok === false ? parsed.message : "Scenario Lab disabled"}`,
    );
  }

  const db = createPrismaClient(String(loaded.env.DATABASE_URL).trim());
  try {
    const databaseLabel = await assertLabDatabaseReady(db, loaded.env);
    const clerkInfo = await assertClerkTrustedOrg(parsed.value);

    console.info("=== Scenario Lab synthetic venue seed ===");
    console.info(`mode: ${hasConfirmSeed() ? "APPLY" : "DRY-RUN"}`);
    console.info(`identity: ${loaded.identity}`);
    console.info(`pooled host: ${loaded.pooled.host}`);
    console.info(`direct host: ${loaded.direct.host}`);
    console.info(`database label: ${databaseLabel}`);
    console.info(`deployment kind: ${parsed.value.deploymentKind}`);
    console.info(`org slug (seed): ${SCENARIO_LAB_SEED_ORG_SLUG}`);
    console.info(`org name (seed): ${SCENARIO_LAB_SEED_ORG_NAME}`);
    console.info(`trusted Clerk org: ${parsed.value.trustedClerkOrganizationId}`);
    console.info(`Clerk org name: ${clerkInfo.clerkOrganizationName}`);
    console.info(`Clerk memberships inspected: ${clerkInfo.membershipCount}`);
    console.info("allowlisted users: 2 (ids not printed)");
    console.info("migrations: 30 applied / 0 pending (baseline check passed)");

    if (!hasConfirmSeed()) {
      const dry = await dryRunSyntheticVenueSeed(db, parsed.value);
      printPlan(dry.plan.items);
      console.info("DRY-RUN complete. No database writes were performed.");
      console.info("To apply: pnpm scenario-lab:seed -- --confirm SEED");
      return;
    }

    const result = await applySyntheticVenueSeed(db, parsed.value);
    printPlan(result.plan.items);
    console.info("=== Apply result ===");
    console.info(`organizationId: ${result.organizationId}`);
    console.info(`locationId: ${result.locationId}`);
    console.info(`staff profiles: ${result.staffProfileIds.length}`);
    console.info(`attraction interests: ${result.attractionInterestIds.length}`);
    console.info(`venueReady: ${result.venueReady}`);
    if (result.venueRequirements.length > 0) {
      console.info("venueRequirements:");
      for (const requirement of result.venueRequirements) {
        console.info(`  - ${requirement}`);
      }
    }
    console.info("Seed apply complete. Scenario runs were not modified.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
