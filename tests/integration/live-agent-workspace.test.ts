import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, InquiryError, ResourceError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { getPublicEventPlanByToken, selectPublicEventPlan } from "@/server/services/event-plan-service";
import { createPublicInquiry, getInquiryDetail, listInquiries } from "@/server/services/inquiry-service";
import {
  markInquiryReadyToFinalize,
  saveAgentWorkingPlan,
  saveEmployeeInternalNotes,
  startWorkingInquiry,
} from "@/server/services/live-agent-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { bulkCreateResources, createResourceType } from "@/server/services/resource-admin-service";
import { reserveResourcesInTransaction } from "@/server/services/resource-availability-service";
import { placeInquiryPlanHold, updateInquiryPlanHold } from "@/server/services/resource-hold-service";
import { createSalesKnowledgeItem } from "@/server/services/sales-knowledge-service";
import { COMMUNICATION_KINDS } from "@/types/communications";
import type { EventPlanPayload } from "@/types/event-planner";
import {
  EVENT_PLAN_KINDS,
  INQUIRY_STATUSES,
  INQUIRY_WORKFLOW_STAGES,
  SALES_KNOWLEDGE_TYPES,
} from "@/types/inquiry";
import { RESOURCE_RESERVATION_SOURCES, RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];
const unlimitedLimiter = createMemoryRateLimiter();

async function cleanup() {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}

afterEach(cleanup);
afterAll(async () => {
  await db.$disconnect();
});

async function provisionTenant(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_${suffix}_${crypto.randomUUID()}`,
      organizationName: `Fun ${suffix}`,
      organizationSlug: `fun-${suffix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  const organization = await db.organization.findFirstOrThrow({ where: { id: result.organizationId } });
  const profile = await db.userProfile.findFirstOrThrow({ where: { id: result.userProfileId } });
  const ctx = await resolveRequestContext(
    {
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: organization.clerkOrganizationId,
    },
    db,
  );
  return { ...result, ctx, organization, profile };
}

async function addGroupUser(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  systemKey: string,
  email: string,
) {
  const group = await db.securityGroup.findFirstOrThrow({
    where: { organizationId: tenant.organizationId, systemKey },
  });
  const profile = await db.userProfile.create({
    data: {
      organizationId: tenant.organizationId,
      clerkUserId: `user_${crypto.randomUUID()}`,
      defaultLocationId: tenant.locationId,
      email,
      firstName: email.split("@")[0] ?? "Agent",
      lastName: "Staff",
    },
  });
  await db.securityGroupMember.create({
    data: {
      organizationId: tenant.organizationId,
      securityGroupId: group.id,
      userProfileId: profile.id,
    },
  });
  const ctx = await resolveRequestContext(
    {
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: tenant.organization.clerkOrganizationId,
    },
    db,
  );
  return { profile, ctx };
}

async function seedBowling(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  laneCount: number,
) {
  await createSalesKnowledgeItem(tenant.ctx, db, {
    type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
    name: "Bowling",
    shortDescription: "Bowling",
    details: "Up to 6 bowlers per lane.",
    priceText: "$10/person",
    maxGuests: 6,
    durationMinutes: 60,
    active: true,
  });
  await createSalesKnowledgeItem(tenant.ctx, db, {
    type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
    name: "Laser Tag",
    shortDescription: "Laser Tag",
    details: "Laser tag arena.",
    priceText: "$8/person",
    active: true,
  });
  const type = await createResourceType(tenant.ctx, db, { name: "Bowling Lane", slug: "bowling-lane" });
  await bulkCreateResources(tenant.ctx, db, {
    resourceTypeId: type.id,
    count: laneCount,
    namePattern: "Bowling Lane {n}",
  });
  return type;
}

async function submitAndSelect(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  email: string,
  guestCount = 12,
) {
  const created = await createPublicInquiry(
    db,
    {
      organizationSlug: tenant.organization.slug,
      rateLimitKey: `${tenant.organization.slug}:${email}`,
      firstName: "Ada",
      lastName: "Lovelace",
      customerGroupName: "Apex Robotics",
      email,
      eventType: "Corporate Event",
      preferredDate: "2026-10-15",
      startTime: "18:00",
      guestCount,
      guestMix: "mostly_adults",
      desiredDurationMinutes: 180,
      budgetBand: "3000_5000",
      eventGoal: "Employee Appreciation",
      diningPreference: "none",
      spacePreference: "no_preference",
      attractionInterestIds: [],
      submissionId: `sub_${crypto.randomUUID()}`,
    },
    undefined,
    unlimitedLimiter,
  );
  const plans = await db.eventPlanRecommendation.findMany({ where: { inquiryId: created.inquiryId } });
  const plan = plans.find((row) => row.availabilityValidated) ?? plans[0]!;
  const selected = await selectPublicEventPlan(
    db,
    { token: created.publicToken, planId: plan.id, rateLimitKey: `${email}-select` },
    unlimitedLimiter,
  );
  return { created, plan, selected };
}

function workingInput(payload: EventPlanPayload, overrides: Partial<{
  eventDate: string | null;
  startTime: string | null;
  durationMinutes: number;
  guestCount: number;
}> = {}) {
  return {
    eventDate: overrides.eventDate ?? payload.eventDate,
    startTime: overrides.startTime ?? payload.startTime,
    durationMinutes: overrides.durationMinutes ?? payload.durationMinutes,
    guestCount: overrides.guestCount ?? payload.guestCount,
    activityIds: payload.activities.map((row) => row.knowledgeItemId),
    activityQuantities: Object.fromEntries(payload.activities.map((row) => [row.knowledgeItemId, row.quantity])),
    diningKnowledgeItemId: payload.dining.knowledgeItemId ?? null,
    spaceKnowledgeItemId: payload.spaces[0]?.knowledgeItemId ?? null,
    scheduleLines: payload.schedule,
    rotations: payload.rotations ?? [],
  };
}

describe("live agent booking workspace (postgres)", () => {
  it("keeps the selected snapshot, persists assignment and drafts, and hides staff data from the customer plan", async () => {
    const tenant = await provisionTenant("live-ws");
    await seedBowling(tenant, 2);
    const { created, plan, selected } = await submitAndSelect(tenant, "live-ws@example.com");
    expect(selected.inquiry.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(selected.inquiry.humanHandoffReason).toBe(READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN);
    expect(selected.inquiry.workflowStage).toBe(INQUIRY_WORKFLOW_STAGES.READY_FOR_LIVE_AGENT);

    const queued = await listInquiries(tenant.ctx, db);
    expect(queued.some((row) => row.id === created.inquiryId && row.selectedEventPlanId === plan.id)).toBe(true);

    const started = await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    expect(started.assignedUserProfileId).toBe(tenant.userProfileId);
    expect(started.assignedAt).toBeTruthy();
    expect(started.workflowStage).toBe(INQUIRY_WORKFLOW_STAGES.AGENT_WORKING);
    expect(started.agentWorkingPlanId).toBeTruthy();

    const original = await db.eventPlanRecommendation.findFirstOrThrow({ where: { id: plan.id } });
    const originalPayload = original.payload;
    const draft = await db.eventPlanRecommendation.findFirstOrThrow({
      where: { id: started.agentWorkingPlanId! },
    });
    expect(draft.kind).toBe(EVENT_PLAN_KINDS.AGENT_WORKING);
    expect(draft.inquiryId).toBe(created.inquiryId);

    const saved = await saveAgentWorkingPlan(
      tenant.ctx,
      db,
      created.inquiryId,
      workingInput(draft.payload as EventPlanPayload, { guestCount: 18 }),
    );
    expect(saved.plan.guestCount).toBe(18);
    expect(saved.plan.estimatedTotalCents).not.toBe(original.estimatedTotalCents);
    expect(saved.plan.id).toBe(draft.id);

    const selectedAfter = await db.eventPlanRecommendation.findFirstOrThrow({ where: { id: plan.id } });
    expect(selectedAfter.kind).toBe(EVENT_PLAN_KINDS.RECOMMENDATION);
    expect(selectedAfter.guestCount).toBe(original.guestCount);
    expect(selectedAfter.payload).toEqual(originalPayload);

    const returned = await db.eventPlanRecommendation.findFirstOrThrow({ where: { id: draft.id } });
    expect(returned.guestCount).toBe(18);

    await saveEmployeeInternalNotes(tenant.ctx, db, created.inquiryId, "Called customer, left voicemail");
    const publicView = await getPublicEventPlanByToken(db, created.publicToken);
    expect(publicView.plans.every((row) => row.kind === EVENT_PLAN_KINDS.RECOMMENDATION)).toBe(true);
    expect(publicView.plans.some((row) => row.id === draft.id)).toBe(false);
    expect(publicView.inquiry.employeeInternalNotes).toBeNull();
    expect(publicView.inquiry.id).toBe(created.inquiryId);

    const other = await addGroupUser(tenant, SYSTEM_GROUP_KEYS.EVENT_SALES, "second@example.com");
    const asOther = await getInquiryDetail(other.ctx, db, created.inquiryId);
    expect(asOther?.assignedUserProfileId).toBe(tenant.userProfileId);
    expect(asOther?.assignedUser?.id).toBe(tenant.userProfileId);

    const stolen = await startWorkingInquiry(other.ctx, db, created.inquiryId);
    expect(stolen.assignedUserProfileId).toBe(tenant.userProfileId);

    const desk = await addGroupUser(tenant, SYSTEM_GROUP_KEYS.FRONT_DESK, "desk-live@example.com");
    await expect(listInquiries(desk.ctx, db)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(startWorkingInquiry(desk.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(placeInquiryPlanHold(desk.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rechecks availability, holds transactionally, and never books on ready to finalize", async () => {
    const tenant = await provisionTenant("live-hold");
    const type = await seedBowling(tenant, 4);
    const { created, selected } = await submitAndSelect(tenant, "live-hold@example.com");
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const draft = await db.eventPlanRecommendation.findFirstOrThrow({
      where: { inquiryId: created.inquiryId, kind: EVENT_PLAN_KINDS.AGENT_WORKING },
    });
    const payload = draft.payload as EventPlanPayload;

    const repriced = await saveAgentWorkingPlan(
      tenant.ctx,
      db,
      created.inquiryId,
      workingInput(payload, { startTime: "19:00" }),
    );
    expect(repriced.plan.availabilityCheckedAt).toBeTruthy();
    expect(repriced.availability.result).toBeTruthy();

    const lanes = await db.resource.findMany({
      where: { organizationId: tenant.organizationId, resourceTypeId: type.id },
      orderBy: { displayOrder: "asc" },
    });
    await reserveResourcesInTransaction(db, {
      organizationId: tenant.organizationId,
      status: RESOURCE_RESERVATION_STATUSES.HOLD,
      sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
      slotDate: "2026-10-15",
      startMinute: 19 * 60,
      endMinute: 22 * 60,
      resourceIds: lanes.slice(0, 3).map((row) => row.id),
    });
    await expect(placeInquiryPlanHold(tenant.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(ResourceError);
    expect(
      await db.resourceReservation.count({
        where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId },
      }),
    ).toBe(0);

    await db.resourceReservation.updateMany({
      where: { organizationId: tenant.organizationId, inquiryId: null },
      data: { releasedAt: new Date() },
    });

    await saveAgentWorkingPlan(tenant.ctx, db, created.inquiryId, workingInput(payload, { startTime: "18:00" }));
    await placeInquiryPlanHold(tenant.ctx, db, created.inquiryId);
    const held = await db.resourceReservation.findMany({
      where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId, releasedAt: null },
    });
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((row) => row.status === RESOURCE_RESERVATION_STATUSES.HOLD)).toBe(true);

    const heldIds = new Set(held.map((row) => row.resourceId));
    const leftover = lanes.filter((row) => !heldIds.has(row.id)).map((row) => row.id);
    if (leftover.length > 0) {
      await reserveResourcesInTransaction(db, {
        organizationId: tenant.organizationId,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
        sourceType: RESOURCE_RESERVATION_SOURCES.MANUAL,
        slotDate: "2026-10-15",
        startMinute: 18 * 60,
        endMinute: 21 * 60,
        resourceIds: leftover,
      });
    }

    await saveAgentWorkingPlan(tenant.ctx, db, created.inquiryId, workingInput(payload, { guestCount: 24 }));
    await expect(updateInquiryPlanHold(tenant.ctx, db, created.inquiryId)).rejects.toBeInstanceOf(ResourceError);
    const stillHeld = await db.resourceReservation.findMany({
      where: {
        organizationId: tenant.organizationId,
        inquiryId: created.inquiryId,
        releasedAt: null,
        status: RESOURCE_RESERVATION_STATUSES.HOLD,
      },
    });
    expect(stillHeld.map((row) => row.id).sort()).toEqual(held.map((row) => row.id).sort());

    const inquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    await markInquiryReadyToFinalize(tenant.ctx, db, created.inquiryId, inquiry.updatedAt.toISOString());
    const finalized = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(finalized.status).toBe(INQUIRY_STATUSES.READY_FOR_HUMAN);
    expect(finalized.workflowStage).toBe(INQUIRY_WORKFLOW_STAGES.READY_TO_FINALIZE);
    expect(
      await db.resourceReservation.count({
        where: {
          organizationId: tenant.organizationId,
          inquiryId: created.inquiryId,
          status: RESOURCE_RESERVATION_STATUSES.BOOKED,
        },
      }),
    ).toBe(0);
    expect(
      await db.communicationEvent.count({
        where: { organizationId: tenant.organizationId, kind: COMMUNICATION_KINDS.BOOKING_CONFIRMATION },
      }),
    ).toBe(0);
    expect(selected.inquiry.id).toBe(created.inquiryId);
  });

  it("rejects a stale working-plan save", async () => {
    const tenant = await provisionTenant("live-stale");
    await seedBowling(tenant, 2);
    const { created } = await submitAndSelect(tenant, "live-stale@example.com");
    await startWorkingInquiry(tenant.ctx, db, created.inquiryId);
    const draft = await db.eventPlanRecommendation.findFirstOrThrow({
      where: { inquiryId: created.inquiryId, kind: EVENT_PLAN_KINDS.AGENT_WORKING },
    });
    await expect(
      saveAgentWorkingPlan(
        tenant.ctx,
        db,
        created.inquiryId,
        workingInput(draft.payload as EventPlanPayload, { guestCount: 16 }),
        "2000-01-01T00:00:00.000Z",
      ),
    ).rejects.toBeInstanceOf(InquiryError);
  });
});
