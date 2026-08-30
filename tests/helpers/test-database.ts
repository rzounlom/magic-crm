import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import {
  assertTestDatabaseIsIsolated,
  parseTestDatabaseEnv,
} from "@/lib/env/validation";

export function loadTestDatabaseEnv() {
  const testSource: NodeJS.Dict<string> = {};
  const developmentSource: NodeJS.Dict<string> = {};
  config({ path: ".env.test", processEnv: testSource });
  config({ path: ".env", processEnv: developmentSource });

  if (!testSource.MAGICCRM_DATABASE_ROLE) {
    testSource.MAGICCRM_DATABASE_ROLE = process.env.MAGICCRM_DATABASE_ROLE;
  }

  const testEnv = parseTestDatabaseEnv({
    ...process.env,
    ...testSource,
  });

  assertTestDatabaseIsIsolated(testEnv, developmentSource);
  return testEnv;
}

export function createTestPrismaClient() {
  const testEnv = loadTestDatabaseEnv();
  return createPrismaClient(testEnv.DATABASE_URL);
}
