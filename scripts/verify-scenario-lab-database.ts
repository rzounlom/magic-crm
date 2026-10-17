/**
 * Read-only verification of .env.scenario-lab.local against Neon.
 * Does NOT migrate, reset, push, seed, or provision identity.
 *
 * Usage: pnpm scenario-lab:verify-database
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

import { createPrismaClient } from "@/lib/db/create-client";

const require = createRequire(import.meta.url);
const { loadScenarioLabEnv } = require("./load-scenario-lab-env.mjs") as {
  loadScenarioLabEnv: () => {
    env: NodeJS.Dict<string>;
    path: string;
    identity: string;
    pooled: { host: string; endpoint: string; database: string };
    direct: { host: string; endpoint: string; database: string };
    developmentIdentities: string[];
    testIdentities: string[];
  };
};

function migrationDirectories(): string[] {
  const root = join(process.cwd(), "prisma", "migrations");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function main() {
  let loaded;
  try {
    loaded = loadScenarioLabEnv();
  } catch (error) {
    console.error(`[scenario-lab] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  const { env, path, identity, pooled, developmentIdentities, testIdentities } = loaded;

  console.info("=== Scenario Lab database verification (read-only) ===");
  console.info(`env file: ${path}`);
  console.info(`MAGICCRM_DEPLOYMENT_KIND: ${env.MAGICCRM_DEPLOYMENT_KIND}`);
  console.info(`SCENARIO_LAB_ENABLED: ${env.SCENARIO_LAB_ENABLED}`);
  console.info(`pooled host: ${pooled.host}`);
  console.info(`direct host: ${loaded.direct.host}`);
  console.info(`database name: ${pooled.database}`);
  console.info(`identity (endpoint/database): ${identity}`);
  console.info(
    `differs from DEV: ${developmentIdentities.every((id) => id !== identity) ? "yes" : "NO — ABORT"}`,
  );
  console.info(
    `differs from integration TEST: ${testIdentities.every((id) => id !== identity) ? "yes" : "NO — ABORT"}`,
  );

  const db = createPrismaClient(String(env.DATABASE_URL).trim());

  try {
    const dbRows = await db.$queryRaw<Array<{ current_database: string }>>`
      SELECT current_database()::text AS current_database
    `;
    const currentDatabase = dbRows[0]?.current_database;
    console.info(`active current_database(): ${currentDatabase}`);
    if (currentDatabase !== pooled.database) {
      console.error(
        "[scenario-lab] Active connection database name does not match DATABASE_URL pathname.",
      );
      process.exit(1);
    }

    const tableRows = await db.$queryRaw<Array<{ has_migrations_table: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '_prisma_migrations'
      ) AS has_migrations_table
    `;
    const hasMigrationsTable = Boolean(tableRows[0]?.has_migrations_table);
    console.info(`_prisma_migrations table: ${hasMigrationsTable ? "present" : "absent"}`);

    const committed = migrationDirectories();
    console.info(`committed migrations in repo: ${committed.length}`);

    let applied: string[] = [];
    if (hasMigrationsTable) {
      const appliedRows = await db.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
        ORDER BY migration_name ASC
      `;
      applied = appliedRows.map((row) => row.migration_name);
      console.info(`applied migrations on Scenario Lab DB: ${applied.length}`);
    } else {
      console.info("applied migrations on Scenario Lab DB: 0 (no migrations table)");
    }

    const appliedSet = new Set(applied);
    const pending = committed.filter((name) => !appliedSet.has(name));
    console.info(`pending migrations to apply: ${pending.length}`);
    if (pending.length > 0) {
      console.info("pending (first 10):");
      for (const name of pending.slice(0, 10)) {
        console.info(`  - ${name}`);
      }
      if (pending.length > 10) {
        console.info(`  … and ${pending.length - 10} more`);
      }
    }

    const identityTableRows = await db.$queryRaw<Array<{ has_identity_table: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'database_environment_identity'
      ) AS has_identity_table
    `;
    const hasIdentityTable = Boolean(identityTableRows[0]?.has_identity_table);
    console.info(`database_environment_identity table: ${hasIdentityTable ? "present" : "absent"}`);

    if (hasIdentityTable) {
      const identityRows = await db.$queryRaw<Array<{ id: string; kind: string; label: string }>>`
        SELECT id, kind, label
        FROM database_environment_identity
        WHERE id = 'singleton'
      `;
      if (identityRows[0]) {
        console.info(
          `identity sentinel: id=${identityRows[0].id} kind=${identityRows[0].kind} label=${identityRows[0].label}`,
        );
      } else {
        console.info("identity sentinel: not provisioned yet");
      }
    }

    console.info("");
    console.info("=== Proposed next commands (NOT run by this script) ===");
    if (pending.length > 0) {
      console.info("1) Apply committed migrations to Scenario Lab only:");
      console.info("   pnpm scenario-lab:migrate-deploy");
    } else {
      console.info("1) Migrations: none pending (schema already matches applied set, or empty pending).");
    }
    console.info("2) After migrations + token filled, provision identity (still requires approval):");
    console.info(
      '   pnpm scenario-lab:provision-db-identity -- --confirm-nonproduction --label "Scenario Lab TEST"',
    );
    console.info("");
    console.info("No migrations, resets, pushes, seeds, or identity writes were performed.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
