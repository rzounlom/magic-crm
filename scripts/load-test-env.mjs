import { config } from "dotenv";
import { spawnSync } from "node:child_process";

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
  const url = new URL(raw);
  return {
    host: url.hostname,
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

export function loadTestEnv() {
  const testEnv = loadIsolated(".env.test");
  const developmentEnvs = [loadIsolated(".env"), loadIsolated(".env.local")];

  if (testEnv.MAGICCRM_DATABASE_ROLE !== "test") {
    throw new Error(
      "Integration tests require MAGICCRM_DATABASE_ROLE=test in .env.test. The development database will not be used.",
    );
  }

  if (!testEnv.DATABASE_URL || !testEnv.DIRECT_URL) {
    throw new Error(
      "Test DATABASE_URL and DIRECT_URL must be set in .env.test and cannot fall back to the development environment.",
    );
  }

  const testIdentities = [testEnv.DATABASE_URL, testEnv.DIRECT_URL].map(databaseIdentity);
  if (testIdentities.some((identity) => !identity)) {
    throw new Error("Test database URL must identify a PostgreSQL database.");
  }

  const developmentIdentities = developmentEnvs
    .flatMap((env) => [env.DATABASE_URL, env.DIRECT_URL])
    .map(databaseIdentity)
    .filter(Boolean);
  if (developmentIdentities.length === 0) {
    throw new Error("Development DATABASE_URL is required so tests can prove they are not using it.");
  }

  for (const testIdentity of testIdentities) {
    if (developmentIdentities.includes(testIdentity)) {
      throw new Error("Test database must not match the development database.");
    }
  }

  const developmentRaw = developmentEnvs
    .flatMap((env) => [env.DATABASE_URL, env.DIRECT_URL])
    .find((value) => value?.trim());
  const test = sanitizedTarget(testEnv.DATABASE_URL);
  const development = sanitizedTarget(developmentRaw);
  console.info(
    `[magiccrm] test database role=test host=${test.host} database=${test.database}; development host=${development.host} database=${development.database}`,
  );

  return testEnv;
}

export function runWithTestEnv(command, args) {
  const testEnv = loadTestEnv();
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...testEnv,
      MAGICCRM_DATABASE_ROLE: "test",
    },
  });

  if (result.status) {
    process.exit(result.status);
  }
}
