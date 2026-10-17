import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MAGICCRM_DEPLOYMENT_KINDS,
  SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID,
  SCENARIO_LAB_DATABASE_KINDS,
  type ScenarioLabEnabledConfig,
} from "@/lib/env/scenario-lab-config";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { requireScenarioLabAccess } from "@/server/scenario-lab/authorize-scenario-lab";
import { assessTrustedVenueReadiness } from "@/server/scenario-lab/run-service";
import {
  SCENARIO_LAB_SEED_OFFERINGS,
  SCENARIO_LAB_SEED_ORG_SLUG,
} from "@/server/scenario-lab/synthetic-venue-constants";
import {
  applySyntheticVenueSeed,
  dryRunSyntheticVenueSeed,
} from "@/server/scenario-lab/synthetic-venue-seed";
import { PERMISSIONS } from "@/types/permissions";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

const VALID_TOKEN = "integration-scenario-lab-seed-token";
const USER_A = "user_lab1_seed_admin_a";
const USER_B = "user_lab1_seed_admin_b";
const TRUSTED_ORG = "org_lab1_seed_trusted";

const seedConfig: ScenarioLabEnabledConfig = {
  deploymentKind: MAGICCRM_DEPLOYMENT_KINDS.SCENARIO_LAB_TEST,
  allowedClerkUserIds: [USER_A, USER_B],
  trustedClerkOrganizationId: TRUSTED_ORG,
  databaseEnvironmentToken: VALID_TOKEN,
  clerkSecretKey: "sk_test_integration_secret",
  clerkPublishableKey: "pk_test_integration_publishable",
};

function labEnv(): NodeJS.Dict<string> {
  return {
    SCENARIO_LAB_ENABLED: "true",
    MAGICCRM_DEPLOYMENT_KIND: MAGICCRM_DEPLOYMENT_KINDS.SCENARIO_LAB_TEST,
    SCENARIO_LAB_ALLOWED_CLERK_USER_IDS: `${USER_A},${USER_B}`,
    SCENARIO_LAB_ORG_ID: TRUSTED_ORG,
    MAGICCRM_DATABASE_ENVIRONMENT_TOKEN: VALID_TOKEN,
    CLERK_SECRET_KEY: "sk_test_integration_secret",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_integration_publishable",
    DATABASE_URL: process.env.DATABASE_URL,
  };
}

async function clearIdentity() {
  await db.databaseEnvironmentIdentity.deleteMany({
    where: { id: SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID },
  });
}

async function provisionIdentity() {
  await db.databaseEnvironmentIdentity.upsert({
    where: { id: SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID },
    create: {
      id: SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID,
      kind: SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST,
      token: VALID_TOKEN,
      label: "Integration Scenario Lab seed TEST",
    },
    update: {
      kind: SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST,
      token: VALID_TOKEN,
      label: "Integration Scenario Lab seed TEST",
    },
  });
}

async function cleanupSeedOrg() {
  const org = await db.organization.findFirst({
    where: {
      OR: [{ clerkOrganizationId: TRUSTED_ORG }, { slug: SCENARIO_LAB_SEED_ORG_SLUG }],
    },
    select: { id: true },
  });
  if (org) {
    createdOrganizationIds.push(org.id);
  }
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}

beforeEach(async () => {
  await cleanupSeedOrg();
  await clearIdentity();
  await provisionIdentity();
});

afterEach(async () => {
  await cleanupSeedOrg();
  await clearIdentity();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("Scenario Lab synthetic venue seed (postgres)", () => {
  it(
    "dry-run proposes records without writing application data",
    async () => {
      const beforeOrgs = await db.organization.count();
      const dry = await dryRunSyntheticVenueSeed(db, seedConfig);
      expect(dry.applied).toBe(false);
      expect(dry.plan.allowlistedClerkUserIds).toEqual([USER_A, USER_B]);
      expect(dry.plan.items.some((item) => item.entity === "organization")).toBe(true);
      expect(dry.plan.items.filter((item) => item.entity === "catalog_offering")).toHaveLength(
        SCENARIO_LAB_SEED_OFFERINGS.length,
      );
      expect(await db.organization.count()).toBe(beforeOrgs);
      expect(await db.userProfile.count({ where: { clerkUserId: { in: [USER_A, USER_B] } } })).toBe(
        0,
      );
    },
    60_000,
  );

  it(
    "seeds trusted org, two admins, catalog readiness, and stays idempotent",
    async () => {
      const first = await applySyntheticVenueSeed(db, seedConfig);
      createdOrganizationIds.push(first.organizationId);

      expect(first.applied).toBe(true);
      expect(first.venueReady).toBe(true);
      expect(first.staffProfileIds).toHaveLength(2);
      expect(first.attractionInterestIds).toHaveLength(SCENARIO_LAB_SEED_OFFERINGS.length);

      const organization = await db.organization.findFirstOrThrow({
        where: { id: first.organizationId },
      });
      expect(organization.clerkOrganizationId).toBe(TRUSTED_ORG);
      expect(organization.slug).toBe(SCENARIO_LAB_SEED_ORG_SLUG);
      expect(organization.onboardingStatus).toBe("ACTIVE");

      const adminGroup = await db.securityGroup.findFirstOrThrow({
        where: {
          organizationId: first.organizationId,
          systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS,
        },
      });
      const adminMembers = await db.securityGroupMember.findMany({
        where: { organizationId: first.organizationId, securityGroupId: adminGroup.id },
        include: { userProfile: true },
      });
      expect(adminMembers).toHaveLength(2);
      expect(new Set(adminMembers.map((row) => row.userProfile.clerkUserId))).toEqual(
        new Set([USER_A, USER_B]),
      );

      const permission = await db.securityGroupPermission.findFirst({
        where: {
          organizationId: first.organizationId,
          securityGroupId: adminGroup.id,
          permissionDefinition: { key: PERMISSIONS.ORGANIZATION_SETTINGS_MANAGE },
        },
      });
      expect(permission).not.toBeNull();

      for (const userId of [USER_A, USER_B]) {
        await requireScenarioLabAccess({
          auth: { clerkUserId: userId, clerkOrganizationId: TRUSTED_ORG },
          database: db,
          env: labEnv(),
        });
      }

      const venue = await assessTrustedVenueReadiness(db, first.organizationId);
      expect(venue.ready).toBe(true);
      expect(venue.attractionInterestIds.length).toBeGreaterThanOrEqual(3);

      const productCount = await db.product.count({
        where: { organizationId: first.organizationId, slug: { startsWith: "lab-" } },
      });
      expect(productCount).toBe(SCENARIO_LAB_SEED_OFFERINGS.length);

      const otherOrgs = await db.organization.count({
        where: {
          id: { not: first.organizationId },
          slug: { startsWith: "magiccrm-scenario-lab" },
        },
      });
      expect(otherOrgs).toBe(0);

      const scenarioRunsBefore = await db.scenarioLabRun.count({
        where: { organizationId: first.organizationId },
      });

      const second = await applySyntheticVenueSeed(db, seedConfig);
      expect(second.organizationId).toBe(first.organizationId);
      expect(second.locationId).toBe(first.locationId);
      expect(await db.product.count({ where: { organizationId: first.organizationId } })).toBe(
        productCount,
      );
      expect(
        await db.userProfile.count({
          where: { organizationId: first.organizationId, clerkUserId: { in: [USER_A, USER_B] } },
        }),
      ).toBe(2);
      expect(
        await db.scenarioLabRun.count({ where: { organizationId: first.organizationId } }),
      ).toBe(scenarioRunsBefore);
    },
    90_000,
  );

  it(
    "refuses to steal an existing slug owned by another Clerk org",
    async () => {
      const conflict = await db.organization.create({
        data: {
          clerkOrganizationId: "org_lab1_seed_conflict_other",
          name: "Conflict Org",
          slug: SCENARIO_LAB_SEED_ORG_SLUG,
          timezone: "UTC",
          currency: "USD",
          onboardingStatus: "ACTIVE",
        },
      });
      createdOrganizationIds.push(conflict.id);

      await expect(applySyntheticVenueSeed(db, seedConfig)).rejects.toThrow(/slug/i);
    },
    60_000,
  );
});
