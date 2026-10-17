import { describe, expect, it } from "vitest";

import { MAGICCRM_DEPLOYMENT_KINDS, SCENARIO_LAB_DATABASE_KINDS } from "@/lib/env/scenario-lab-config";
import { assertScenarioLabEnvironment } from "@/server/scenario-lab/environment-guard";
import { ScenarioLabError } from "@/server/scenario-lab/errors";

const VALID_TOKEN = "scenario-lab-token-01";
const DATABASE_URL = "postgresql://magiccrm:secret@ep-lab.example.test/neondb";

function enabledEnv(overrides: NodeJS.Dict<string> = {}): NodeJS.Dict<string> {
  return {
    SCENARIO_LAB_ENABLED: "true",
    MAGICCRM_DEPLOYMENT_KIND: MAGICCRM_DEPLOYMENT_KINDS.SCENARIO_LAB_TEST,
    SCENARIO_LAB_ALLOWED_CLERK_USER_IDS: "user_allowlisted_aaa,user_allowlisted_bbb",
    SCENARIO_LAB_ORG_ID: "org_trusted_test",
    MAGICCRM_DATABASE_ENVIRONMENT_TOKEN: VALID_TOKEN,
    CLERK_SECRET_KEY: "sk_test_example_secret",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example_publishable",
    DATABASE_URL,
    ...overrides,
  };
}

function databaseStub(options: {
  currentDatabase?: string;
  identity?: { id: string; kind: string; token: string; label: string } | null;
}) {
  return {
    $queryRaw: async () => [{ current_database: options.currentDatabase ?? "neondb" }],
    databaseEnvironmentIdentity: {
      findUnique: async () => options.identity ?? null,
    },
  };
}

describe("assertScenarioLabEnvironment", () => {
  it("verifies a provisioned scenario_lab_test identity against the active connection", async () => {
    const verified = await assertScenarioLabEnvironment(
      enabledEnv(),
      databaseStub({
        identity: {
          id: "singleton",
          kind: SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST,
          token: VALID_TOKEN,
          label: "Scenario Lab TEST",
        },
      }),
    );

    expect(verified.databaseLabel).toBe("Scenario Lab TEST");
    expect(verified.connectionIdentityLabel).toBe("ep-lab.example.test/neondb");
  });

  it("rejects customer production deployment identity", async () => {
    await expect(
      assertScenarioLabEnvironment(
        enabledEnv({ MAGICCRM_DEPLOYMENT_KIND: MAGICCRM_DEPLOYMENT_KINDS.CUSTOMER_PRODUCTION }),
        databaseStub({
          identity: {
            id: "singleton",
            kind: SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST,
            token: VALID_TOKEN,
            label: "Scenario Lab TEST",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "PRODUCTION_DEPLOYMENT" } satisfies Partial<ScenarioLabError>);
  });

  it("rejects a missing database identity sentinel", async () => {
    await expect(
      assertScenarioLabEnvironment(enabledEnv(), databaseStub({ identity: null })),
    ).rejects.toMatchObject({ code: "DATABASE_IDENTITY_MISSING" });
  });

  it("rejects a token mismatch", async () => {
    await expect(
      assertScenarioLabEnvironment(
        enabledEnv(),
        databaseStub({
          identity: {
            id: "singleton",
            kind: SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST,
            token: "different-token-xxx",
            label: "Scenario Lab TEST",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "DATABASE_IDENTITY_MISMATCH" });
  });

  it("rejects when current_database() does not match DATABASE_URL", async () => {
    await expect(
      assertScenarioLabEnvironment(
        enabledEnv(),
        databaseStub({
          currentDatabase: "otherdb",
          identity: {
            id: "singleton",
            kind: SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST,
            token: VALID_TOKEN,
            label: "Scenario Lab TEST",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "DATABASE_CONNECTION_MISMATCH" });
  });

  it("never treats an unlabeled/unknown kind as TEST", async () => {
    await expect(
      assertScenarioLabEnvironment(
        enabledEnv(),
        databaseStub({
          identity: {
            id: "singleton",
            kind: "unknown",
            token: VALID_TOKEN,
            label: "Mystery DB",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "DATABASE_IDENTITY_MISMATCH" });
  });
});
