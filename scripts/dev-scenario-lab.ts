/**
 * Start Next.js against the dedicated Scenario Lab Neon database.
 *
 * Process env is preloaded from `.env.scenario-lab.local` so Next's automatic
 * `.env` / `.env.local` merge cannot silently win for already-set keys.
 *
 * Usage: pnpm scenario-lab:dev
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import { createPrismaClient } from "@/lib/db/create-client";
import {
  SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID,
  SCENARIO_LAB_DATABASE_KINDS,
} from "@/lib/env/scenario-lab-config";
import { assertScenarioLabSeedEndpoint } from "@/server/scenario-lab/synthetic-venue-constants";

const require = createRequire(import.meta.url);
const { loadScenarioLabEnv } = require("./load-scenario-lab-env.mjs") as {
  loadScenarioLabEnv: () => {
    env: NodeJS.Dict<string>;
    identity: string;
    pooled: { host: string; endpoint: string; database: string };
    direct: { host: string; endpoint: string; database: string };
  };
};

const DEFAULT_PORT = "3010";

function fail(message: string): never {
  console.error(`[scenario-lab:dev] ${message}`);
  process.exit(1);
}

async function preflight() {
  const loaded = loadScenarioLabEnv();
  assertScenarioLabSeedEndpoint(loaded.identity);
  if (!loaded.pooled.endpoint.includes("ep-lucky-hall-av5j542n")) {
    fail("Pooled endpoint is not the dedicated Scenario Lab branch");
  }
  if (!loaded.direct.endpoint.includes("ep-lucky-hall-av5j542n")) {
    fail("Direct endpoint is not the dedicated Scenario Lab branch");
  }

  const env = loaded.env;
  if (env.MAGICCRM_DEPLOYMENT_KIND !== "scenario_lab_test") {
    fail("MAGICCRM_DEPLOYMENT_KIND must be scenario_lab_test");
  }
  if (env.SCENARIO_LAB_ENABLED !== "true") {
    fail("SCENARIO_LAB_ENABLED must be true");
  }
  if (!String(env.CLERK_SECRET_KEY ?? "").startsWith("sk_test_")) {
    fail("CLERK_SECRET_KEY must be Clerk TEST (sk_test_)");
  }
  if (!String(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").startsWith("pk_test_")) {
    fail("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be Clerk TEST (pk_test_)");
  }
  if (!String(env.SCENARIO_LAB_ORG_ID ?? "").startsWith("org_")) {
    fail("SCENARIO_LAB_ORG_ID must be set");
  }

  const allowlist = String(env.SCENARIO_LAB_ALLOWED_CLERK_USER_IDS ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    allowlist.length !== 2 ||
    new Set(allowlist).size !== 2 ||
    !allowlist.every((id) => id.startsWith("user_"))
  ) {
    fail("Exactly two distinct allowlisted Clerk user ids are required");
  }

  const token = String(env.MAGICCRM_DATABASE_ENVIRONMENT_TOKEN ?? "").trim();
  if (token.length < 16) {
    fail("MAGICCRM_DATABASE_ENVIRONMENT_TOKEN is missing or too short");
  }

  const db = createPrismaClient(String(env.DATABASE_URL).trim());
  try {
    const dbRows = await db.$queryRaw<Array<{ current_database: string }>>`
      SELECT current_database()::text AS current_database
    `;
    if (dbRows[0]?.current_database !== loaded.pooled.database) {
      fail("Active database name does not match Scenario Lab DATABASE_URL");
    }

    const identity = await db.databaseEnvironmentIdentity.findUnique({
      where: { id: SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID },
      select: { kind: true, token: true, label: true },
    });
    if (!identity) {
      fail("database_environment_identity sentinel is missing");
    }
    if (identity.kind !== SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST) {
      fail(`Unexpected identity kind: ${identity.kind}`);
    }
    if (identity.token !== token) {
      fail("Database identity token does not match configured token");
    }
    if (identity.label !== "Scenario Lab TEST") {
      fail(`Unexpected identity label: ${identity.label}`);
    }

    const migration = await db.$queryRaw<Array<{ finished: bigint }>>`
      SELECT COUNT(*) FILTER (WHERE finished_at IS NOT NULL)::bigint AS finished
      FROM _prisma_migrations
    `;
    if (Number(migration[0]?.finished ?? 0) !== 30) {
      fail(`Expected 30 finished migrations, found ${Number(migration[0]?.finished ?? 0)}`);
    }

    return { loaded, label: identity.label, allowlistCount: allowlist.length };
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const { loaded, label, allowlistCount } = await preflight();
  const port = String(process.env.SCENARIO_LAB_PORT ?? DEFAULT_PORT).trim() || DEFAULT_PORT;
  const appUrl = `http://localhost:${port}`;

  console.info("[scenario-lab:dev] Preflight OK");
  console.info(`[scenario-lab:dev] identity: ${loaded.identity}`);
  console.info(`[scenario-lab:dev] pooled host: ${loaded.pooled.host}`);
  console.info(`[scenario-lab:dev] direct host: ${loaded.direct.host}`);
  console.info(`[scenario-lab:dev] database label: ${label}`);
  console.info("[scenario-lab:dev] deployment kind: scenario_lab_test");
  console.info(`[scenario-lab:dev] allowlisted users: ${allowlistCount}`);
  console.info("[scenario-lab:dev] Clerk keys: TEST");
  console.info(`[scenario-lab:dev] listening on ${appUrl}`);
  console.info(
    "[scenario-lab:dev] Child process env is primed from .env.scenario-lab.local (overrides .env / .env.local for set keys).",
  );

  const child = spawn("corepack", ["pnpm", "exec", "next", "dev", "--port", port], {
    stdio: "inherit",
    env: {
      ...process.env,
      ...loaded.env,
      MAGICCRM_DEPLOYMENT_KIND: "scenario_lab_test",
      SCENARIO_LAB_ENABLED: "true",
      MAGICCRM_DATABASE_ROLE: "",
      PORT: port,
      APP_URL: appUrl,
    },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
