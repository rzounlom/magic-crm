import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { databaseTargetFromUrl, sanitizeDatabaseTarget } from "@/lib/env/database-target";
import {
  assertTestDatabaseIsIsolated,
  EnvValidationError,
  parseTestDatabaseEnv,
  type TestDatabaseEnv,
} from "@/lib/env/validation";

const TEST_DATABASE_CLIENT = Symbol.for("magiccrm.testDatabaseClient");

let diagnosticPrinted = false;

function readEnvFile(path: string): NodeJS.Dict<string> {
  const source: NodeJS.Dict<string> = {};
  config({ path, processEnv: source });
  return source;
}

function connectionUrls(source: NodeJS.Dict<string>): string[] {
  return [source.DATABASE_URL, source.DIRECT_URL].filter((value): value is string => Boolean(value?.trim()));
}

export function loadTestDatabaseEnv(): TestDatabaseEnv {
  const testSource = readEnvFile(".env.test");
  const developmentSources = [readEnvFile(".env"), readEnvFile(".env.local")];
  const developmentUrls = developmentSources.flatMap(connectionUrls);

  if (!testSource.DATABASE_URL?.trim() || !testSource.DIRECT_URL?.trim()) {
    throw new EnvValidationError([
      "Test DATABASE_URL and DIRECT_URL must be set in .env.test and cannot fall back to the development environment",
    ]);
  }

  const testEnv = parseTestDatabaseEnv({
    MAGICCRM_DATABASE_ROLE: testSource.MAGICCRM_DATABASE_ROLE ?? process.env.MAGICCRM_DATABASE_ROLE,
    DATABASE_URL: testSource.DATABASE_URL,
    DIRECT_URL: testSource.DIRECT_URL,
    APP_URL: testSource.APP_URL,
  });

  assertTestDatabaseIsIsolated(testEnv, {
    DATABASE_URL: developmentUrls[0],
    DIRECT_URL: developmentUrls[1],
    developmentUrls,
  });
  printTestDatabaseDiagnostic(testEnv, developmentUrls);
  return testEnv;
}

function printTestDatabaseDiagnostic(testEnv: TestDatabaseEnv, developmentUrls: string[]): void {
  if (diagnosticPrinted) {
    return;
  }
  diagnosticPrinted = true;
  const test = sanitizeDatabaseTarget(databaseTargetFromUrl(testEnv.DATABASE_URL));
  const development = sanitizeDatabaseTarget(databaseTargetFromUrl(developmentUrls[0]));
  console.info(
    `[magiccrm] test database role=test host=${test?.host ?? "unknown"} database=${test?.database ?? "unknown"}; development host=${development?.host ?? "unknown"} database=${development?.database ?? "unknown"}`,
  );
}

export function createTestPrismaClient() {
  const testEnv = loadTestDatabaseEnv();
  const client = createPrismaClient(testEnv.DATABASE_URL);
  Object.defineProperty(client, TEST_DATABASE_CLIENT, { value: true });
  return client;
}

export function assertTestDatabaseClient(database: object): void {
  loadTestDatabaseEnv();
  if (!(TEST_DATABASE_CLIENT in database)) {
    throw new Error("Cleanup refused: database client is not the integration-test client.");
  }
}
