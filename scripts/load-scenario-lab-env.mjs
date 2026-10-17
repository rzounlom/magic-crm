import { config } from "dotenv";
import { spawnSync } from "node:child_process";

const SCENARIO_LAB_ENV_PATH = ".env.scenario-lab.local";

function loadIsolated(path) {
  const isolated = {};
  config({ path, processEnv: isolated });
  return isolated;
}

function databaseIdentity(raw) {
  if (!raw?.trim()) {
    return null;
  }
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!host || !database) {
    return null;
  }
  return `${host.replace(/-pooler(?=\.)/, "")}/${database}`;
}

function sanitizedTarget(raw) {
  const url = new URL(raw.trim());
  return {
    host: url.hostname.toLowerCase(),
    endpoint: url.hostname.toLowerCase().replace(/-pooler(?=\.)/, ""),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

/**
 * Load Scenario Lab env in isolation. Never falls back to .env / .env.test URLs.
 */
export function loadScenarioLabEnv() {
  const labEnv = loadIsolated(SCENARIO_LAB_ENV_PATH);
  const developmentEnvs = [loadIsolated(".env"), loadIsolated(".env.local")];
  const testEnv = loadIsolated(".env.test");

  if (labEnv.MAGICCRM_DEPLOYMENT_KIND !== "scenario_lab_test") {
    throw new Error(
      `${SCENARIO_LAB_ENV_PATH} must set MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test`,
    );
  }

  if (!labEnv.DATABASE_URL?.trim() || !labEnv.DIRECT_URL?.trim()) {
    throw new Error(
      `${SCENARIO_LAB_ENV_PATH} is missing DATABASE_URL and/or DIRECT_URL. Paste the Neon scenario_lab branch pooled and direct URLs into that file (not into chat).`,
    );
  }

  const labIdentities = [labEnv.DATABASE_URL, labEnv.DIRECT_URL].map(databaseIdentity);
  if (labIdentities.some((identity) => !identity)) {
    throw new Error("Scenario Lab database URLs must identify a PostgreSQL database.");
  }
  if (labIdentities[0] !== labIdentities[1]) {
    throw new Error(
      "Scenario Lab DATABASE_URL and DIRECT_URL must target the same database identity (endpoint/database).",
    );
  }

  const developmentIdentities = developmentEnvs
    .flatMap((env) => [env.DATABASE_URL, env.DIRECT_URL])
    .map(databaseIdentity)
    .filter(Boolean);
  for (const labIdentity of labIdentities) {
    if (developmentIdentities.includes(labIdentity)) {
      throw new Error(
        "Scenario Lab database must not match the development database (.env / .env.local).",
      );
    }
  }

  const testIdentities = [testEnv.DATABASE_URL, testEnv.DIRECT_URL]
    .map(databaseIdentity)
    .filter(Boolean);
  for (const labIdentity of labIdentities) {
    if (testIdentities.includes(labIdentity)) {
      throw new Error(
        "Scenario Lab database must not match the integration TEST database (.env.test).",
      );
    }
  }

  return {
    env: labEnv,
    path: SCENARIO_LAB_ENV_PATH,
    identity: labIdentities[0],
    pooled: sanitizedTarget(labEnv.DATABASE_URL),
    direct: sanitizedTarget(labEnv.DIRECT_URL),
    developmentIdentities,
    testIdentities,
  };
}

export function runWithScenarioLabEnv(command, args) {
  const { env } = loadScenarioLabEnv();
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...env,
      MAGICCRM_DEPLOYMENT_KIND: "scenario_lab_test",
      // Prevent prisma.config.ts from loading .env.test instead
      MAGICCRM_DATABASE_ROLE: "",
    },
  });
  if (result.status) {
    process.exit(result.status);
  }
}
