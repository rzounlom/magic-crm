import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MAGICCRM_DEPLOYMENT_KINDS,
  SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID,
  SCENARIO_LAB_DATABASE_KINDS,
} from "@/lib/env/scenario-lab-config";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { requireScenarioLabAccess } from "@/server/scenario-lab/authorize-scenario-lab";
import { ScenarioLabError } from "@/server/scenario-lab/errors";
import { hasScenarioLabAccess } from "@/server/scenario-lab/load-scenario-lab-access";
import { resolveRequestContext } from "@/server/request-context";
import { provisionOrganization } from "@/server/services/provision-organization";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

const VALID_TOKEN = "integration-scenario-lab-token";
const USER_A = "user_lab1a_admin_a";
const USER_B = "user_lab1a_admin_b";
const TRUSTED_ORG = "org_lab1a_trusted";

async function cleanupOrgs() {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}

async function clearIdentity() {
  await db.databaseEnvironmentIdentity.deleteMany({
    where: { id: SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID },
  });
}

async function provisionIdentity(token = VALID_TOKEN) {
  await db.databaseEnvironmentIdentity.upsert({
    where: { id: SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID },
    create: {
      id: SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID,
      kind: SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST,
      token,
      label: "Integration Scenario Lab TEST",
    },
    update: {
      kind: SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST,
      token,
      label: "Integration Scenario Lab TEST",
    },
  });
}

function labEnv(overrides: NodeJS.Dict<string> = {}): NodeJS.Dict<string> {
  return {
    SCENARIO_LAB_ENABLED: "true",
    MAGICCRM_DEPLOYMENT_KIND: MAGICCRM_DEPLOYMENT_KINDS.SCENARIO_LAB_TEST,
    SCENARIO_LAB_ALLOWED_CLERK_USER_IDS: `${USER_A},${USER_B}`,
    SCENARIO_LAB_ORG_ID: TRUSTED_ORG,
    MAGICCRM_DATABASE_ENVIRONMENT_TOKEN: VALID_TOKEN,
    CLERK_SECRET_KEY: "sk_test_integration_secret",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_integration_publishable",
    DATABASE_URL: process.env.DATABASE_URL,
    ...overrides,
  };
}

async function provisionTrustedAdmin(clerkUserId: string) {
  const result = await provisionOrganization(
    {
      clerkUserId,
      clerkOrganizationId: TRUSTED_ORG,
      organizationName: "Scenario Lab Trusted Org",
      organizationSlug: `lab1a-trusted-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  const ctx = await resolveRequestContext(
    {
      clerkUserId,
      clerkOrganizationId: TRUSTED_ORG,
    },
    db,
  );
  return { ...result, ctx };
}

beforeEach(async () => {
  await clearIdentity();
  await provisionIdentity();
});

afterEach(async () => {
  await cleanupOrgs();
  await clearIdentity();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("Scenario Lab authorization (postgres)", () => {
  it("allows a correctly allowlisted administrator in the trusted org", async () => {
    await provisionTrustedAdmin(USER_A);

    const access = await requireScenarioLabAccess({
      auth: { clerkUserId: USER_A, clerkOrganizationId: TRUSTED_ORG },
      database: db,
      env: labEnv(),
    });

    expect(access.request.clerkUserId).toBe(USER_A);
    expect(access.environment.databaseLabel).toBe("Integration Scenario Lab TEST");
  });

  it("rejects a signed-out user", async () => {
    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: null, clerkOrganizationId: null },
        database: db,
        env: labEnv(),
      }),
    ).rejects.toBeInstanceOf(ScenarioLabError);

    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: null, clerkOrganizationId: null },
        database: db,
        env: labEnv(),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects a non-allowlisted user", async () => {
    await provisionTrustedAdmin("user_lab1a_outsider");

    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: "user_lab1a_outsider", clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv(),
      }),
    ).rejects.toMatchObject({ code: "USER_NOT_ALLOWLISTED" });
  });

  it("rejects the wrong organization", async () => {
    const otherOrgId = `org_lab1a_other_${crypto.randomUUID()}`;
    const other = await provisionOrganization(
      {
        clerkUserId: USER_A,
        clerkOrganizationId: otherOrgId,
        organizationName: "Other Org",
        organizationSlug: `lab1a-other-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(other.organizationId);

    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: otherOrgId },
        database: db,
        env: labEnv(),
      }),
    ).rejects.toMatchObject({ code: "WRONG_ORGANIZATION" });
  });

  it("rejects an allowlisted user missing administrative permission", async () => {
    const admin = await provisionTrustedAdmin(USER_A);
    const frontDesk = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: admin.organizationId, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });
    await db.userProfile.create({
      data: {
        organizationId: admin.organizationId,
        clerkUserId: USER_B,
        firstName: "Desk",
        lastName: "Staff",
      },
    });
    const deskProfile = await db.userProfile.findFirstOrThrow({
      where: { organizationId: admin.organizationId, clerkUserId: USER_B },
    });
    await db.securityGroupMember.create({
      data: {
        organizationId: admin.organizationId,
        securityGroupId: frontDesk.id,
        userProfileId: deskProfile.id,
      },
    });

    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: USER_B, clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv(),
      }),
    ).rejects.toMatchObject({ code: "MISSING_PERMISSION" });
  });

  it("rejects when the feature is disabled", async () => {
    await provisionTrustedAdmin(USER_A);

    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv({ SCENARIO_LAB_ENABLED: "false" }),
      }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("rejects customer production deployment identity", async () => {
    await provisionTrustedAdmin(USER_A);

    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv({ MAGICCRM_DEPLOYMENT_KIND: MAGICCRM_DEPLOYMENT_KINDS.CUSTOMER_PRODUCTION }),
      }),
    ).rejects.toMatchObject({ code: "PRODUCTION_DEPLOYMENT" });
  });

  it("rejects a database identity token mismatch", async () => {
    await provisionTrustedAdmin(USER_A);
    await provisionIdentity("different-integration-token");

    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv(),
      }),
    ).rejects.toMatchObject({ code: "DATABASE_IDENTITY_MISMATCH" });
  });

  it("rejects cross-tenant access when the allowlisted user is active in another org", async () => {
    await provisionTrustedAdmin(USER_A);
    const otherOrgId = `org_lab1a_cross_${crypto.randomUUID()}`;
    const other = await provisionOrganization(
      {
        clerkUserId: USER_A,
        clerkOrganizationId: otherOrgId,
        organizationName: "Cross Tenant",
        organizationSlug: `lab1a-cross-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(other.organizationId);

    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: otherOrgId },
        database: db,
        env: labEnv(),
      }),
    ).rejects.toMatchObject({ code: "WRONG_ORGANIZATION" });
  });

  it("persists a Scenario Lab run ownership row for the trusted org", async () => {
    const admin = await provisionTrustedAdmin(USER_B);
    const access = await requireScenarioLabAccess({
      auth: { clerkUserId: USER_B, clerkOrganizationId: TRUSTED_ORG },
      database: db,
      env: labEnv(),
    });

    const run = await db.scenarioLabRun.create({
      data: {
        organizationId: access.request.organizationId,
        createdByUserProfileId: access.request.userId,
        templateKey: "customer_submits_inquiry",
        status: "initialized",
        correlationToken: `lab1a_${crypto.randomUUID().replace(/-/g, "")}`,
        idempotencyKey: `idem_${crypto.randomUUID()}`,
        timeline: [],
      },
    });

    const owned = await db.scenarioLabOwnedEntity.create({
      data: {
        organizationId: access.request.organizationId,
        runId: run.id,
        entityType: "inquiry",
        entityId: "fixture_inquiry_placeholder",
      },
    });

    expect(run.organizationId).toBe(admin.organizationId);
    expect(owned.runId).toBe(run.id);
  });
});

describe("Scenario Lab navigation soft probe (postgres)", () => {
  it("returns true for both allowlisted administrators in the trusted org", async () => {
    const adminA = await provisionTrustedAdmin(USER_A);
    // Second allowlisted user joins the same org as an Administrator (permission required by LAB1-A).
    await provisionOrganization(
      {
        clerkUserId: USER_B,
        clerkOrganizationId: TRUSTED_ORG,
        organizationName: "Scenario Lab Trusted Org",
        organizationSlug: `lab1a-trusted-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    const administrators = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: adminA.organizationId, systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS },
    });
    const profileB = await db.userProfile.findFirstOrThrow({
      where: { organizationId: adminA.organizationId, clerkUserId: USER_B },
    });
    await db.securityGroupMember.create({
      data: {
        organizationId: adminA.organizationId,
        securityGroupId: administrators.id,
        userProfileId: profileB.id,
      },
    });

    await expect(
      hasScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv(),
      }),
    ).resolves.toBe(true);

    await expect(
      hasScenarioLabAccess({
        auth: { clerkUserId: USER_B, clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv(),
      }),
    ).resolves.toBe(true);
  });

  it("returns false for the wrong Clerk organization", async () => {
    await provisionTrustedAdmin(USER_A);
    const otherOrgId = `org_lab1a_nav_other_${crypto.randomUUID()}`;
    const other = await provisionOrganization(
      {
        clerkUserId: USER_A,
        clerkOrganizationId: otherOrgId,
        organizationName: "Nav Other Org",
        organizationSlug: `lab1a-nav-other-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(other.organizationId);

    await expect(
      hasScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: otherOrgId },
        database: db,
        env: labEnv(),
      }),
    ).resolves.toBe(false);
  });

  it("returns false for a non-allowlisted user", async () => {
    await provisionTrustedAdmin("user_lab1a_nav_outsider");

    await expect(
      hasScenarioLabAccess({
        auth: { clerkUserId: "user_lab1a_nav_outsider", clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv(),
      }),
    ).resolves.toBe(false);
  });

  it("returns false for local_development and customer_production deployments", async () => {
    await provisionTrustedAdmin(USER_A);

    await expect(
      hasScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv({ MAGICCRM_DEPLOYMENT_KIND: MAGICCRM_DEPLOYMENT_KINDS.LOCAL_DEVELOPMENT }),
      }),
    ).resolves.toBe(false);

    await expect(
      hasScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv({ MAGICCRM_DEPLOYMENT_KIND: MAGICCRM_DEPLOYMENT_KINDS.CUSTOMER_PRODUCTION }),
      }),
    ).resolves.toBe(false);
  });

  it("returns false when Scenario Lab is disabled", async () => {
    await provisionTrustedAdmin(USER_A);

    await expect(
      hasScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv({ SCENARIO_LAB_ENABLED: "false" }),
      }),
    ).resolves.toBe(false);
  });
});
