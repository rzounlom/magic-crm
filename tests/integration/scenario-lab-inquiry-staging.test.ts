import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MAGICCRM_DEPLOYMENT_KINDS,
  SCENARIO_LAB_DATABASE_IDENTITY_ROW_ID,
  SCENARIO_LAB_DATABASE_KINDS,
} from "@/lib/env/scenario-lab-config";
import { requireScenarioLabAccess } from "@/server/scenario-lab/authorize-scenario-lab";
import { ScenarioLabError } from "@/server/scenario-lab/errors";
import {
  createCustomerInquiryScenarioRun,
  getScenarioLabRunDetail,
  markScenarioLabPublicIntakeOpened,
} from "@/server/scenario-lab/run-service";
import { resolveRequestContext } from "@/server/request-context";
import { createPublicInquiry } from "@/server/services/inquiry-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { futureEventDate } from "../helpers/future-event-date";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

const VALID_TOKEN = "integration-scenario-lab-token-b";
const USER_A = "user_lab1b_admin_a";
const USER_B = "user_lab1b_admin_b";
const TRUSTED_ORG = "org_lab1b_trusted";

async function cleanupOrgs() {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
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
      label: "Integration Scenario Lab TEST",
    },
    update: {
      kind: SCENARIO_LAB_DATABASE_KINDS.SCENARIO_LAB_TEST,
      token: VALID_TOKEN,
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
      organizationName: "Scenario Lab Trusted Org B",
      organizationSlug: `lab1b-trusted-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);

  await db.attractionInterest.create({
    data: {
      organizationId: result.organizationId,
      slug: `bowling-${crypto.randomUUID().slice(0, 8)}`,
      label: "Bowling",
      displayOrder: 0,
      active: true,
    },
  });

  const ctx = await resolveRequestContext(
    { clerkUserId, clerkOrganizationId: TRUSTED_ORG },
    db,
  );
  return { ...result, ctx };
}

async function labAccess(clerkUserId: string) {
  return requireScenarioLabAccess({
    auth: { clerkUserId, clerkOrganizationId: TRUSTED_ORG },
    database: db,
    env: labEnv(),
  });
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

describe("Scenario Lab inquiry staging (postgres)", () => {
  it("creates an authorized inquiry scenario run and opens public intake", async () => {
    await provisionTrustedAdmin(USER_A);
    const access = await labAccess(USER_A);
    const idempotencyKey = `idem_${crypto.randomUUID()}`;

    const created = await createCustomerInquiryScenarioRun(access.request, db, {
      idempotencyKey,
      eventDate: futureEventDate(30),
      guestCount: 14,
    });
    expect(created.reused).toBe(false);

    const reused = await createCustomerInquiryScenarioRun(access.request, db, {
      idempotencyKey,
      eventDate: futureEventDate(30),
    });
    expect(reused).toEqual({ runId: created.runId, reused: true });

    const opened = await markScenarioLabPublicIntakeOpened(access.request, db, created.runId);
    expect(opened.publicIntakePath).toContain("/inquire/");
    expect(opened.publicIntakePath).toContain("lab=");
    expect(opened.publicIntakePath).not.toContain(created.runId);

    const detail = await getScenarioLabRunDetail(access.request, db, created.runId);
    expect(detail.status).toBe("running");
    expect(detail.fixture?.guestCount).toBe(14);
    expect(detail.awaitingInquirySubmission).toBe(true);
  });

  it("denies unauthorized run creation", async () => {
    await provisionTrustedAdmin(USER_A);
    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: "user_lab1b_outsider", clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv(),
      }),
    ).rejects.toMatchObject({ code: "USER_NOT_ALLOWLISTED" });
  });

  it("denies wrong-organization and disabled lab", async () => {
    await provisionTrustedAdmin(USER_A);
    const otherOrg = `org_lab1b_other_${crypto.randomUUID()}`;
    const other = await provisionOrganization(
      {
        clerkUserId: USER_A,
        clerkOrganizationId: otherOrg,
        organizationName: "Other",
        organizationSlug: `lab1b-other-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(other.organizationId);

    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: otherOrg },
        database: db,
        env: labEnv(),
      }),
    ).rejects.toMatchObject({ code: "WRONG_ORGANIZATION" });

    await expect(
      requireScenarioLabAccess({
        auth: { clerkUserId: USER_A, clerkOrganizationId: TRUSTED_ORG },
        database: db,
        env: labEnv({ SCENARIO_LAB_ENABLED: "false" }),
      }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("correlates a real public inquiry to the run without exposing run ids", async () => {
    await provisionTrustedAdmin(USER_A);
    const access = await labAccess(USER_A);
    const created = await createCustomerInquiryScenarioRun(access.request, db, {
      idempotencyKey: `idem_${crypto.randomUUID()}`,
      eventDate: futureEventDate(35),
    });
    await markScenarioLabPublicIntakeOpened(access.request, db, created.runId);

    const run = await db.scenarioLabRun.findFirstOrThrow({
      where: { id: created.runId },
      select: { correlationToken: true, organizationId: true, fixturePayload: true },
    });
    const fixture = run.fixturePayload as {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      eventType: string;
      guestCount: number;
      guestMix: string;
      foodPreference: string;
      privateSpacePreference: string;
      budgetBand: string;
      desiredDurationMinutes: number;
      eventDate: string;
      attractionInterestIds: string[];
      notes: string;
    };
    const organization = await db.organization.findFirstOrThrow({
      where: { id: run.organizationId },
      select: { slug: true },
    });

    const inquiry = await createPublicInquiry(db, {
      organizationSlug: organization.slug,
      rateLimitKey: `lab1b-${crypto.randomUUID()}`,
      firstName: fixture.firstName,
      lastName: fixture.lastName,
      email: fixture.email,
      phone: fixture.phone,
      eventType: fixture.eventType,
      preferredDate: fixture.eventDate,
      startTime: "14:00",
      guestCount: fixture.guestCount,
      guestMix: fixture.guestMix,
      desiredDurationMinutes: fixture.desiredDurationMinutes,
      budgetBand: fixture.budgetBand,
      foodPreference: fixture.foodPreference,
      privateSpacePreference: fixture.privateSpacePreference,
      attractionInterestIds: fixture.attractionInterestIds,
      notes: fixture.notes,
      submissionId: crypto.randomUUID(),
      scenarioLabCorrelationToken: run.correlationToken,
    });

    const detail = await getScenarioLabRunDetail(access.request, db, created.runId);
    expect(detail.status).toBe("completed");
    expect(detail.inquiry?.id).toBe(inquiry.inquiryId);
    expect(detail.awaitingInquirySubmission).toBe(false);

    const owned = await db.scenarioLabOwnedEntity.findMany({
      where: { organizationId: run.organizationId, entityType: "inquiry", entityId: inquiry.inquiryId },
    });
    expect(owned).toHaveLength(1);
    expect(owned[0]?.runId).toBe(created.runId);
  });

  it("isolates inquiry ownership across runs", async () => {
    await provisionTrustedAdmin(USER_A);
    const access = await labAccess(USER_A);
    const runA = await createCustomerInquiryScenarioRun(access.request, db, {
      idempotencyKey: `idem_${crypto.randomUUID()}`,
    });
    const runB = await createCustomerInquiryScenarioRun(access.request, db, {
      idempotencyKey: `idem_${crypto.randomUUID()}`,
    });
    await markScenarioLabPublicIntakeOpened(access.request, db, runA.runId);
    await markScenarioLabPublicIntakeOpened(access.request, db, runB.runId);

    const tokenA = (
      await db.scenarioLabRun.findFirstOrThrow({
        where: { id: runA.runId },
        select: { correlationToken: true },
      })
    ).correlationToken;
    const tokenB = (
      await db.scenarioLabRun.findFirstOrThrow({
        where: { id: runB.runId },
        select: { correlationToken: true },
      })
    ).correlationToken;
    const org = await db.organization.findFirstOrThrow({
      where: { id: access.request.organizationId },
      select: { slug: true },
    });
    const interest = await db.attractionInterest.findFirstOrThrow({
      where: { organizationId: access.request.organizationId, active: true },
    });

    const base = {
      organizationSlug: org.slug,
      firstName: "Avery",
      lastName: "Example",
      phone: "5550109999",
      eventType: "Birthday Party",
      preferredDate: futureEventDate(40),
      startTime: "15:00",
      guestCount: 10,
      guestMix: "mixed_ages",
      desiredDurationMinutes: 120 as const,
      budgetBand: "1500_3000",
      foodPreference: "NO_FOOD",
      privateSpacePreference: "NO_PREFERENCE",
      attractionInterestIds: [interest.id] as string[],
      notes: "Scenario Lab synthetic inquiry — do not contact as a real customer.",
    };

    const inquiryA = await createPublicInquiry(db, {
      ...base,
      email: `a.${crypto.randomUUID()}@example.com`,
      rateLimitKey: `lab1b-a-${crypto.randomUUID()}`,
      submissionId: crypto.randomUUID(),
      scenarioLabCorrelationToken: tokenA,
    });
    const inquiryB = await createPublicInquiry(db, {
      ...base,
      email: `b.${crypto.randomUUID()}@example.com`,
      rateLimitKey: `lab1b-b-${crypto.randomUUID()}`,
      submissionId: crypto.randomUUID(),
      scenarioLabCorrelationToken: tokenB,
    });

    const detailA = await getScenarioLabRunDetail(access.request, db, runA.runId);
    const detailB = await getScenarioLabRunDetail(access.request, db, runB.runId);
    expect(detailA.inquiry?.id).toBe(inquiryA.inquiryId);
    expect(detailB.inquiry?.id).toBe(inquiryB.inquiryId);
    expect(detailA.inquiry?.id).not.toBe(detailB.inquiry?.id);
  });

  it("keeps public intake validation intact when lab token is invalid", async () => {
    await provisionTrustedAdmin(USER_A);
    const access = await labAccess(USER_A);
    const org = await db.organization.findFirstOrThrow({
      where: { id: access.request.organizationId },
      select: { slug: true },
    });
    const interest = await db.attractionInterest.findFirstOrThrow({
      where: { organizationId: access.request.organizationId, active: true },
    });

    const inquiry = await createPublicInquiry(db, {
      organizationSlug: org.slug,
      rateLimitKey: `lab1b-invalid-${crypto.randomUUID()}`,
      firstName: "Casey",
      lastName: "Example",
      email: `casey.${crypto.randomUUID()}@example.com`,
      phone: "5550101111",
      eventType: "Birthday Party",
      preferredDate: futureEventDate(41),
      startTime: "16:00",
      guestCount: 8,
      guestMix: "mostly_adults",
      desiredDurationMinutes: 90,
      budgetBand: "under_1500",
      foodPreference: "NO_FOOD",
      privateSpacePreference: "NO_PREFERENCE",
      attractionInterestIds: [interest.id],
      submissionId: crypto.randomUUID(),
      scenarioLabCorrelationToken: "ffffffffffffffffffffffffffffffff",
    });

    expect(inquiry.inquiryId).toBeTruthy();
    const owned = await db.scenarioLabOwnedEntity.findMany({
      where: { organizationId: access.request.organizationId, entityId: inquiry.inquiryId },
    });
    expect(owned).toHaveLength(0);
  });

  it("enforces tenant isolation on run detail", async () => {
    await provisionTrustedAdmin(USER_A);
    const access = await labAccess(USER_A);
    const created = await createCustomerInquiryScenarioRun(access.request, db, {
      idempotencyKey: `idem_${crypto.randomUUID()}`,
    });

    const otherOrg = `org_lab1b_iso_${crypto.randomUUID()}`;
    const other = await provisionOrganization(
      {
        clerkUserId: USER_B,
        clerkOrganizationId: otherOrg,
        organizationName: "Iso Org",
        organizationSlug: `lab1b-iso-${crypto.randomUUID()}`,
        isClerkOrganizationAdmin: true,
      },
      db,
    );
    createdOrganizationIds.push(other.organizationId);
    const otherCtx = await resolveRequestContext(
      { clerkUserId: USER_B, clerkOrganizationId: otherOrg },
      db,
    );

    await expect(getScenarioLabRunDetail(otherCtx, db, created.runId)).rejects.toBeInstanceOf(
      ScenarioLabError,
    );
  });
});
