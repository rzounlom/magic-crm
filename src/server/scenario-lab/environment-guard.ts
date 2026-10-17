import "server-only";

import {
  databaseIdentity,
  databaseTargetFromUrl,
} from "@/lib/env/database-target";
import {
  MAGICCRM_DEPLOYMENT_KINDS,
  parseScenarioLabConfig,
  SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID,
  SCENARIO_LAB_DATABASE_KINDS,
  type ScenarioLabEnabledConfig,
} from "@/lib/env/scenario-lab-config";
import { ScenarioLabError } from "@/server/scenario-lab/errors";

export type ScenarioLabDatabaseIdentityRow = {
  id: string;
  kind: string;
  token: string;
  label: string;
};

export type ScenarioLabEnvironmentDatabase = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  databaseEnvironmentIdentity: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; kind: true; token: true; label: true };
    }) => Promise<ScenarioLabDatabaseIdentityRow | null>;
  };
};

export type VerifiedScenarioLabEnvironment = {
  config: ScenarioLabEnabledConfig;
  databaseLabel: string;
  databaseKind: typeof SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST;
  /** Safe identity derived from the active connection (endpoint/database), never a full URL. */
  connectionIdentityLabel: string;
};

/**
 * Verify Scenario Lab may operate in this process against the active database.
 * Never trusts request input. Never treats an unlabeled database as TEST.
 */
export async function assertScenarioLabEnvironment(
  source: NodeJS.Dict<string>,
  database: ScenarioLabEnvironmentDatabase,
): Promise<VerifiedScenarioLabEnvironment> {
  const parsed = parseScenarioLabConfig(source);
  if (!parsed.ok) {
    throw new ScenarioLabError(parsed.code, parsed.message);
  }

  if (parsed.value.deploymentKind !== MAGICCRM_DEPLOYMENT_KINDS.SCENARIO_LAB_TEST) {
    throw new ScenarioLabError("INVALID_DEPLOYMENT_KIND");
  }

  const databaseUrl = source.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new ScenarioLabError(
      "DATABASE_CONNECTION_MISMATCH",
      "DATABASE_URL is required for Scenario Lab database identity verification",
    );
  }

  const urlTarget = databaseTargetFromUrl(databaseUrl);
  if (!urlTarget) {
    throw new ScenarioLabError(
      "DATABASE_CONNECTION_MISMATCH",
      "DATABASE_URL must identify a PostgreSQL database",
    );
  }

  const connectionRows = (await database.$queryRaw`
    SELECT current_database()::text AS current_database
  `) as Array<{ current_database: string }>;
  const currentDatabase = connectionRows[0]?.current_database?.trim();
  if (!currentDatabase) {
    throw new ScenarioLabError(
      "DATABASE_CONNECTION_MISMATCH",
      "Active connection did not report current_database()",
    );
  }

  if (currentDatabase !== urlTarget.database) {
    throw new ScenarioLabError(
      "DATABASE_CONNECTION_MISMATCH",
      "Active connection database name does not match DATABASE_URL database name",
    );
  }

  const identity = await database.databaseEnvironmentIdentity.findUnique({
    where: { id: SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID },
    select: { id: true, kind: true, token: true, label: true },
  });

  if (!identity) {
    throw new ScenarioLabError(
      "DATABASE_IDENTITY_MISSING",
      "Database environment identity sentinel is not provisioned",
    );
  }

  if (identity.kind !== SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST) {
    throw new ScenarioLabError(
      "DATABASE_IDENTITY_MISMATCH",
      "Database environment identity kind is not scenario_lab_test",
    );
  }

  if (identity.token !== parsed.value.databaseEnvironmentToken) {
    throw new ScenarioLabError(
      "DATABASE_IDENTITY_MISMATCH",
      "Database environment identity token does not match MAGICCRM_DATABASE_ENVIRONMENT_TOKEN",
    );
  }

  const safeLabel = identity.label.trim() || "Scenario Lab TEST";
  const connectionIdentity = databaseIdentity(urlTarget);
  if (!connectionIdentity) {
    throw new ScenarioLabError("DATABASE_CONNECTION_MISMATCH");
  }

  return {
    config: parsed.value,
    databaseLabel: safeLabel,
    databaseKind: SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST,
    connectionIdentityLabel: connectionIdentity,
  };
}
