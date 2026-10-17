import { describe, expect, it } from "vitest";

import {
  MAGICCRM_DEPLOYMENT_KINDS,
  parseScenarioLabAllowlist,
  parseScenarioLabConfig,
  scenarioLabAllowlistContains,
} from "@/lib/env/scenario-lab-config";

const VALID_TOKEN = "scenario-lab-token-01";
const USER_A = "user_allowlisted_aaa";
const USER_B = "user_allowlisted_bbb";

function enabledBase(overrides: NodeJS.Dict<string> = {}): NodeJS.Dict<string> {
  return {
    SCENARIO_LAB_ENABLED: "true",
    MAGICCRM_DEPLOYMENT_KIND: MAGICCRM_DEPLOYMENT_KINDS.SCENARIO_LAB_TEST,
    SCENARIO_LAB_ALLOWED_CLERK_USER_IDS: `${USER_A},${USER_B}`,
    SCENARIO_LAB_ORG_ID: "org_trusted_test",
    MAGICCRM_DATABASE_ENVIRONMENT_TOKEN: VALID_TOKEN,
    CLERK_SECRET_KEY: "sk_test_example_secret",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example_publishable",
    ...overrides,
  };
}

describe("parseScenarioLabAllowlist", () => {
  it("accepts exactly two distinct Clerk user IDs", () => {
    const parsed = parseScenarioLabAllowlist(`${USER_A}, ${USER_B}`);
    expect(parsed).toEqual({ ok: true, userIds: [USER_A, USER_B] });
  });

  it("rejects fewer or more than two IDs", () => {
    expect(parseScenarioLabAllowlist(USER_A).ok).toBe(false);
    expect(parseScenarioLabAllowlist(`${USER_A},${USER_B},user_ccc`).ok).toBe(false);
  });

  it("rejects duplicate IDs", () => {
    expect(parseScenarioLabAllowlist(`${USER_A},${USER_A}`).ok).toBe(false);
  });

  it("rejects email-shaped entries", () => {
    expect(parseScenarioLabAllowlist("admin@example.com,other@example.com").ok).toBe(false);
  });
});

describe("parseScenarioLabConfig", () => {
  it("enables a consistent scenario_lab_test configuration", () => {
    const parsed = parseScenarioLabConfig(enabledBase());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.allowedClerkUserIds).toEqual([USER_A, USER_B]);
    expect(parsed.value.trustedClerkOrganizationId).toBe("org_trusted_test");
    expect(scenarioLabAllowlistContains(parsed.value, USER_A)).toBe(true);
    expect(scenarioLabAllowlistContains(parsed.value, "user_other")).toBe(false);
  });

  it("fails closed when the feature is disabled", () => {
    const parsed = parseScenarioLabConfig(enabledBase({ SCENARIO_LAB_ENABLED: "false" }));
    expect(parsed).toMatchObject({ ok: false, code: "FEATURE_DISABLED" });
  });

  it("rejects customer production even when enabled", () => {
    const parsed = parseScenarioLabConfig(
      enabledBase({ MAGICCRM_DEPLOYMENT_KIND: MAGICCRM_DEPLOYMENT_KINDS.CUSTOMER_PRODUCTION }),
    );
    expect(parsed).toMatchObject({ ok: false, code: "PRODUCTION_DEPLOYMENT" });
  });

  it("does not treat NODE_ENV=production as deployment identity", () => {
    const parsed = parseScenarioLabConfig(
      enabledBase({
        NODE_ENV: "production",
        MAGICCRM_DEPLOYMENT_KIND: MAGICCRM_DEPLOYMENT_KINDS.SCENARIO_LAB_TEST,
      }),
    );
    expect(parsed.ok).toBe(true);
  });

  it("rejects local_development deployment kind when enabled", () => {
    const parsed = parseScenarioLabConfig(
      enabledBase({ MAGICCRM_DEPLOYMENT_KIND: MAGICCRM_DEPLOYMENT_KINDS.LOCAL_DEVELOPMENT }),
    );
    expect(parsed).toMatchObject({ ok: false, code: "INVALID_DEPLOYMENT_KIND" });
  });

  it("rejects Clerk LIVE keys", () => {
    const parsed = parseScenarioLabConfig(
      enabledBase({
        CLERK_SECRET_KEY: "sk_live_example",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_example",
      }),
    );
    expect(parsed).toMatchObject({ ok: false, code: "INVALID_CLERK_INSTANCE" });
  });

  it("rejects an invalid allowlist count", () => {
    const parsed = parseScenarioLabConfig(
      enabledBase({ SCENARIO_LAB_ALLOWED_CLERK_USER_IDS: USER_A }),
    );
    expect(parsed).toMatchObject({ ok: false, code: "INVALID_ALLOWLIST" });
  });

  it("rejects a missing trusted organization id", () => {
    const parsed = parseScenarioLabConfig(enabledBase({ SCENARIO_LAB_ORG_ID: "" }));
    expect(parsed).toMatchObject({ ok: false, code: "MISSING_ORG_ID" });
  });

  it("rejects a short database environment token", () => {
    const parsed = parseScenarioLabConfig(
      enabledBase({ MAGICCRM_DATABASE_ENVIRONMENT_TOKEN: "short" }),
    );
    expect(parsed).toMatchObject({ ok: false, code: "MISSING_DATABASE_TOKEN" });
  });
});
