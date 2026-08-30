import { config } from "dotenv";
import { spawnSync } from "node:child_process";

function loadIsolated(path) {
  const isolated = {};
  config({ path, processEnv: isolated });
  return isolated;
}

export function loadTestEnv() {
  const testEnv = loadIsolated(".env.test");
  const developmentEnv = loadIsolated(".env");

  if (testEnv.MAGICCRM_DATABASE_ROLE !== "test") {
    throw new Error(
      "Integration tests require MAGICCRM_DATABASE_ROLE=test in .env.test. The development database will not be used.",
    );
  }

  if (!testEnv.DATABASE_URL || !testEnv.DIRECT_URL) {
    throw new Error("Test DATABASE_URL and DIRECT_URL must be set in .env.test.");
  }

  if (developmentEnv.DATABASE_URL && developmentEnv.DATABASE_URL === testEnv.DATABASE_URL) {
    throw new Error("Test DATABASE_URL must not match the development database.");
  }

  if (developmentEnv.DIRECT_URL && developmentEnv.DIRECT_URL === testEnv.DIRECT_URL) {
    throw new Error("Test DIRECT_URL must not match the development database.");
  }

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
