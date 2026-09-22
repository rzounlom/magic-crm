import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  createPublicConversationToken,
  hashPublicConversationToken,
  isPlausiblePublicConversationToken,
} from "@/lib/ai/public-conversation-token";
import { getPublicRateLimiter, type RateLimiter } from "@/lib/ai/rate-limiter";
import { personalEventPlanNotification } from "@/lib/event-planner/email-context";
import { publicInquiryPathForActiveOrganization } from "@/lib/inquiries/organization-display-name";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { resolveTenantTimezone } from "@/lib/inquiries/tenant-datetime";
import { AuthorizationError, InquiryError } from "@/server/errors";
import {
  isHoneypotFilled,
  normalizePublicEmail,
  publicConversationMessageSchema,
  publicIntakeSchema,
} from "@/server/inquiries/intake-validation";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { recordAuditEvent, recordSecurityAudit } from "@/server/services/audit";
import { attractionInterestIdsFromJson } from "@/server/event-planner/build-event-plans";
import { attractionModeFromIntake, audienceFromGuestMix } from "@/server/catalog/audience";
import { normalizeInvitationEmail } from "@/server/team/invitation-email";
import { resolvePrimaryLocationId } from "@/server/locations/primary-location";
import { generateEventPlansForInquiry } from "@/server/services/event-plan-service";
import { startWorkingInquiry } from "@/server/services/live-agent-service";
import { runSalesAgentTurn, type SalesAgentRuntime } from "@/server/services/sales-agent-service";
import {
  CONVERSATION_CHANNELS,
  EVENT_PLAN_KINDS,
  INQUIRY_SALES_STAGES,
  INQUIRY_SOURCES,
  INQUIRY_STATUSES,
  INQUIRY_WORKFLOW_STAGES,
  INQUIRY_LIST_VIEWS,
  parseInquiryListView,
  MESSAGE_DIRECTIONS,
  MESSAGE_SENDER_TYPES,
} from "@/types/inquiry";
import { EVENT_PLAN_TIERS } from "@/types/event-planner";
import { PERMISSIONS } from "@/types/permissions";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";

type InquiryDb = PrismaClient;

export type PublicIntakeInput = {
  organizationSlug: string;
  rateLimitKey: string;
  firstName: string;
  lastName: string;
  customerGroupName?: string;
  email: string;
  phone?: string;
  eventType?: string;
  preferredDate?: string;
  startTime?: string;
  guestCount?: number;
  guestMix?: string;
  desiredDurationMinutes?: number;
  budgetBand?: string;
  eventGoal?: string;
  diningPreference?: string;
  spacePreference?: string;
  attractionInterestIds?: string[];
  attractionMode?: string;
  notes?: string;
  companyWebsite?: string;
  submissionId: string;
};

export async function getCurrentTenantPublicInquiryPath(
  ctx: RequestContext,
  database: InquiryDb,
): Promise<string> {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  const organization = await database.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { slug: true, onboardingStatus: true },
  });
  const path = publicInquiryPathForActiveOrganization(organization);
  if (!path) {
    throw new AuthorizationError("FORBIDDEN");
  }
  return path;
}

export async function getCurrentTenantTimezone(
  ctx: RequestContext,
  database: InquiryDb,
): Promise<string> {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  const [organization, location] = await Promise.all([
    database.organization.findFirst({
      where: { id: ctx.organizationId },
      select: { timezone: true },
    }),
    ctx.locationId
      ? database.location.findFirst({
          where: { id: ctx.locationId, organizationId: ctx.organizationId },
          select: { timezone: true },
        })
      : Promise.resolve(null),
  ]);
  return resolveTenantTimezone({
    organizationTimezone: organization?.timezone,
    locationTimezone: location?.timezone,
  });
}

export async function resolvePublicInquiryOrganization(
  database: InquiryDb,
  slug: string,
) {
  const organization = await database.organization.findFirst({
    where: { slug: slug.trim().toLowerCase() },
    select: { id: true, name: true, slug: true, onboardingStatus: true },
  });
  if (!organization || organization.onboardingStatus !== "ACTIVE") {
    throw new InquiryError("TENANT_NOT_AVAILABLE");
  }
  return organization;
}

export async function createPublicInquiry(
  database: InquiryDb,
  input: PublicIntakeInput,
  _runtime?: SalesAgentRuntime,
  rateLimiter: RateLimiter = getPublicRateLimiter(),
) {
  const parsed = publicIntakeSchema.safeParse(input);
  if (!parsed.success) {
    throw new InquiryError("INVALID_INTAKE");
  }
  if (isHoneypotFilled(parsed.data.companyWebsite)) {
    throw new InquiryError("INVALID_INTAKE");
  }

  const limited = await rateLimiter.consume(`intake:${input.rateLimitKey}`, 5, 10 * 60_000);
  if (!limited.ok) {
    throw new InquiryError("RATE_LIMITED");
  }

  const organization = await resolvePublicInquiryOrganization(database, input.organizationSlug);
  const locationId = await resolvePrimaryLocationId(database, organization.id);
  const emailNormalized = normalizePublicEmail(parsed.data.email);
  const { token, hash } = createPublicConversationToken();
  const desiredDate = parsed.data.preferredDate
    ? new Date(`${parsed.data.preferredDate}T00:00:00.000Z`)
    : null;

  const created = await database.$transaction(async (tx) => {
    const inquiry = await tx.inquiry.create({
      data: {
        organizationId: organization.id,
        locationId,
        status: INQUIRY_STATUSES.NEW,
        source: INQUIRY_SOURCES.WEB,
        customerFirstName: parsed.data.firstName,
        customerLastName: parsed.data.lastName,
        customerGroupName: parsed.data.customerGroupName?.trim() || null,
        customerEmail: parsed.data.email.trim(),
        customerEmailNormalized: emailNormalized,
        customerPhone: parsed.data.phone || null,
        eventType: parsed.data.eventType,
        occasion: parsed.data.eventGoal,
        eventGoal: parsed.data.eventGoal,
        desiredDate,
        desiredStartTime: parsed.data.startTime?.trim() || null,
        guestCount: parsed.data.guestCount,
        guestMix: parsed.data.guestMix,
        desiredDurationMinutes: parsed.data.desiredDurationMinutes,
        budgetMin: parsed.data.budgetMin,
        budgetMax: parsed.data.budgetMax,
        diningPreference: parsed.data.diningPreference,
        spacePreference: parsed.data.spacePreference,
        attractionInterestIds: parsed.data.attractionInterestIds,
        customerNotes: parsed.data.notes?.trim() || null,
        aiHandlingEnabled: false,
        salesStage: INQUIRY_SALES_STAGES.INQUIRY,
        audience: audienceFromGuestMix(parsed.data.guestMix),
        attractionMode: attractionModeFromIntake({
          attractionMode: parsed.data.attractionMode,
          attractionInterestIds: parsed.data.attractionInterestIds,
        }),
      },
    });

    const conversation = await tx.conversation.create({
      data: {
        organizationId: organization.id,
        inquiryId: inquiry.id,
        channel: CONVERSATION_CHANNELS.WEB,
        publicTokenHash: hash,
      },
    });

    const intakeText = formatIntakeMessage(parsed.data);
    await tx.conversationMessage.create({
      data: {
        organizationId: organization.id,
        conversationId: conversation.id,
        direction: MESSAGE_DIRECTIONS.INBOUND,
        senderType: MESSAGE_SENDER_TYPES.CUSTOMER,
        content: intakeText,
        clientSubmissionId: parsed.data.submissionId,
      },
    });

    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    return { inquiry, conversation };
  });

  await recordAuditEvent(database, {
    organizationId: organization.id,
    action: "inquiry.created",
    resourceType: "inquiry",
    resourceId: created.inquiry.id,
    metadata: { source: INQUIRY_SOURCES.WEB, channel: CONVERSATION_CHANNELS.WEB },
  });

  try {
    const appUrl = process.env.APP_URL?.trim();
    await generateEventPlansForInquiry(database, {
      organizationId: organization.id,
      inquiryId: created.inquiry.id,
      ...(appUrl
        ? {
            planNotification: personalEventPlanNotification({
              customerEmail: parsed.data.email.trim(),
              customerFirstName: parsed.data.firstName,
              customerLastName: parsed.data.lastName,
              organizationName: organization.name,
              planPath: `/plan/${token}`,
              appUrl,
              eventDate: parsed.data.preferredDate ?? null,
            }),
          }
        : {}),
    });
  } catch {
    await database.inquiry.update({
      where: { id: created.inquiry.id },
      data: {
        status: INQUIRY_STATUSES.NEEDS_FOLLOW_UP,
        humanHandoffReason: READY_FOR_HUMAN_REASONS.GENERATION_FAILED,
      },
    });
  }

  return {
    inquiryId: created.inquiry.id,
    conversationId: created.conversation.id,
    publicToken: token,
  };
}

export async function getPublicConversationByToken(database: InquiryDb, token: string) {
  if (!isPlausiblePublicConversationToken(token)) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }
  const hash = hashPublicConversationToken(token);
  const conversation = await database.conversation.findFirst({
    where: { publicTokenHash: hash, channel: CONVERSATION_CHANNELS.WEB },
    include: {
      inquiry: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          senderType: true,
          content: true,
          createdAt: true,
        },
      },
      organization: { select: { name: true, slug: true } },
    },
  });
  if (!conversation) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }

  return {
    organizationName: conversation.organization.name,
    organizationSlug: conversation.organization.slug,
    inquiry: {
      status: conversation.inquiry.status,
      aiHandlingEnabled: conversation.inquiry.aiHandlingEnabled,
      customerFirstName: conversation.inquiry.customerFirstName,
    },
    messages: conversation.messages.filter(
      (message) =>
        message.senderType === MESSAGE_SENDER_TYPES.CUSTOMER ||
        message.senderType === MESSAGE_SENDER_TYPES.AI ||
        message.senderType === MESSAGE_SENDER_TYPES.EMPLOYEE ||
        message.senderType === MESSAGE_SENDER_TYPES.SYSTEM,
    ),
  };
}

export async function submitPublicConversationMessage(
  database: InquiryDb,
  input: {
    token: string;
    message: string;
    submissionId: string;
    rateLimitKey: string;
  },
  runtime: SalesAgentRuntime,
  rateLimiter: RateLimiter = getPublicRateLimiter(),
) {
  const parsed = publicConversationMessageSchema.safeParse(input);
  if (!parsed.success) {
    throw new InquiryError("INVALID_INTAKE");
  }
  if (!isPlausiblePublicConversationToken(input.token)) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }

  const limited = await rateLimiter.consume(`message:${input.rateLimitKey}`, 10, 10 * 60_000);
  if (!limited.ok) {
    throw new InquiryError("RATE_LIMITED");
  }

  const hash = hashPublicConversationToken(input.token);
  const conversation = await database.conversation.findFirst({
    where: { publicTokenHash: hash },
    include: {
      inquiry: true,
      organization: { select: { name: true } },
    },
  });
  if (!conversation) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }

  try {
    await database.conversationMessage.create({
      data: {
        organizationId: conversation.organizationId,
        conversationId: conversation.id,
        direction: MESSAGE_DIRECTIONS.INBOUND,
        senderType: MESSAGE_SENDER_TYPES.CUSTOMER,
        content: parsed.data.message,
        clientSubmissionId: parsed.data.submissionId,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new InquiryError("DUPLICATE_SUBMISSION");
    }
    throw error;
  }

  await database.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  if (conversation.inquiry.aiHandlingEnabled) {
    await runSalesAgentTurn(database, runtime, {
      organizationId: conversation.organizationId,
      organizationName: conversation.organization.name,
      inquiryId: conversation.inquiryId,
      conversationId: conversation.id,
      trigger: "message",
    });
  }

  return getPublicConversationByToken(database, input.token);
}

export async function listInquiries(
  ctx: RequestContext,
  database: InquiryDb,
  input: { view?: string | null } = {},
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  const archived = parseInquiryListView(input.view) === INQUIRY_LIST_VIEWS.ARCHIVED;
  return database.inquiry.findMany({
    where: {
      organizationId: ctx.organizationId,
      archivedAt: archived ? { not: null } : null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    include: {
      assignedUser: {
        select: { id: true, firstName: true, lastName: true, displayName: true, email: true },
      },
      conversations: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          lastMessageAt: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, senderType: true, createdAt: true },
          },
        },
      },
      eventPlanRecommendations: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          kind: true,
          tier: true,
          title: true,
          estimatedTotalCents: true,
          currency: true,
          availabilityStatus: true,
        },
      },
      resourceReservations: {
        where: {
          releasedAt: null,
          status: RESOURCE_RESERVATION_STATUSES.HOLD,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true, expiresAt: true },
      },
      bookings: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, bookingNumber: true, status: true },
      },
    },
  });
}

export async function getInquiryDetail(
  ctx: RequestContext,
  database: InquiryDb,
  inquiryId: string,
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_VIEW, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: {
      conversations: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
      eventPlanRecommendations: { orderBy: { sortOrder: "asc" } },
      assignedUser: {
        select: { id: true, firstName: true, lastName: true, displayName: true, email: true },
      },
      bookings: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          bookingNumber: true,
          status: true,
          confirmedAt: true,
          availabilityConflictAt: true,
          paymentConfirmedExternallyAt: true,
          depositRequiredCents: true,
          totalCents: true,
          guestCount: true,
          diningLabel: true,
          payload: true,
        },
      },
      resourceReservations: {
        where: {
          OR: [
            {
              status: RESOURCE_RESERVATION_STATUSES.HOLD,
              releasedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            { status: RESOURCE_RESERVATION_STATUSES.BOOKED },
          ],
        },
        include: {
          resource: {
            select: {
              id: true,
              name: true,
              resourceType: { select: { id: true, name: true, slug: true } },
            },
          },
        },
        orderBy: [{ startMinute: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!inquiry) {
    return null;
  }

  const interestIds = attractionInterestIdsFromJson(inquiry.attractionInterestIds);
  const interestItems =
    interestIds.length > 0
      ? await database.salesKnowledgeItem.findMany({
          where: { organizationId: ctx.organizationId, id: { in: interestIds } },
          select: { id: true, name: true },
        })
      : [];
  const namesById = new Map(interestItems.map((item) => [item.id, item.name]));

  return {
    ...inquiry,
    attractionInterestNames: interestIds
      .map((id) => namesById.get(id))
      .filter((name): name is string => Boolean(name)),
  };
}

export async function archiveInquiry(ctx: RequestContext, database: InquiryDb, inquiryId: string) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: {
      bookings: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, bookingNumber: true, status: true },
      },
    },
  });
  if (!inquiry) {
    throw new InquiryError("INQUIRY_NOT_FOUND");
  }
  if (inquiry.archivedAt) {
    return { inquiry, alreadyArchived: true };
  }
  const updated = await database.inquiry.update({
    where: { id: inquiry.id },
    data: { archivedAt: new Date(), archivedByUserProfileId: ctx.userId },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "inquiry.archived",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: {
      bookingId: inquiry.bookings[0]?.id ?? null,
      bookingStatus: inquiry.bookings[0]?.status ?? null,
    },
  });
  return { inquiry: updated, alreadyArchived: false };
}

export async function unarchiveInquiry(ctx: RequestContext, database: InquiryDb, inquiryId: string) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
  });
  if (!inquiry) {
    throw new InquiryError("INQUIRY_NOT_FOUND");
  }
  if (!inquiry.archivedAt) {
    return { inquiry, alreadyArchived: false };
  }
  const updated = await database.inquiry.update({
    where: { id: inquiry.id },
    data: { archivedAt: null, archivedByUserProfileId: null },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "inquiry.unarchived",
    resourceType: "inquiry",
    resourceId: inquiry.id,
  });
  return { inquiry: updated, alreadyArchived: false };
}

export async function takeOverInquiry(
  ctx: RequestContext,
  database: InquiryDb,
  inquiryId: string,
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
  });
  if (!inquiry) {
    throw new AuthorizationError("FORBIDDEN");
  }

  const updated = await database.inquiry.update({
    where: { id: inquiry.id },
    data: {
      aiHandlingEnabled: false,
      status: INQUIRY_STATUSES.READY_FOR_HUMAN,
      assignedUserProfileId: ctx.userId,
      assignedAt: inquiry.assignedAt ?? new Date(),
      humanHandoffRequestedAt: inquiry.humanHandoffRequestedAt ?? new Date(),
      humanHandoffReason: inquiry.selectedEventPlanId
        ? inquiry.humanHandoffReason ?? READY_FOR_HUMAN_REASONS.CUSTOMER_SELECTED_PLAN
        : READY_FOR_HUMAN_REASONS.MANUAL_ESCALATION,
    },
  });

  await recordSecurityAudit(database, ctx, {
    action: "employee.conversation_taken_over",
    resourceType: "inquiry",
    resourceId: inquiry.id,
  });
  await recordSecurityAudit(database, ctx, {
    action: "ai.paused",
    resourceType: "inquiry",
    resourceId: inquiry.id,
  });

  return updated;
}

export async function resumeInquiryAi(
  ctx: RequestContext,
  database: InquiryDb,
  inquiryId: string,
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
  });
  if (!inquiry) {
    throw new AuthorizationError("FORBIDDEN");
  }

  const updated = await database.inquiry.update({
    where: { id: inquiry.id },
    data: {
      aiHandlingEnabled: true,
      status:
        inquiry.status === INQUIRY_STATUSES.READY_FOR_HUMAN ||
        inquiry.status === INQUIRY_STATUSES.NEEDS_FOLLOW_UP
          ? INQUIRY_STATUSES.AI_ENGAGED
          : inquiry.status,
      humanHandoffRequestedAt: null,
      humanHandoffReason: null,
    },
  });

  await recordSecurityAudit(database, ctx, {
    action: "ai.resumed",
    resourceType: "inquiry",
    resourceId: inquiry.id,
  });
  return updated;
}

export async function addEmployeeConversationMessage(
  ctx: RequestContext,
  database: InquiryDb,
  input: { inquiryId: string; conversationId: string; content: string },
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const content = input.content.trim();
  if (!content || content.length > 2000) {
    throw new InquiryError("INVALID_INTAKE");
  }

  const conversation = await database.conversation.findFirst({
    where: {
      id: input.conversationId,
      inquiryId: input.inquiryId,
      organizationId: ctx.organizationId,
    },
  });
  if (!conversation) {
    throw new AuthorizationError("FORBIDDEN");
  }

  await database.conversationMessage.create({
    data: {
      organizationId: ctx.organizationId,
      conversationId: conversation.id,
      direction: MESSAGE_DIRECTIONS.OUTBOUND,
      senderType: MESSAGE_SENDER_TYPES.EMPLOYEE,
      content,
    },
  });
  await database.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
}

export type EmployeeManualBookingInput = {
  firstName: string;
  lastName: string;
  customerGroupName?: string | null;
  email: string;
  phone?: string | null;
  eventType: string;
  eventGoal?: string | null;
  preferredDate: string;
  startTime: string;
  guestCount: number;
  guestMix?: string | null;
  desiredDurationMinutes: number;
  diningPreference?: string | null;
  spacePreference?: string | null;
  attractionInterestIds?: string[];
  notes?: string | null;
  locationId?: string | null;
};

export async function createEmployeeManualInquiry(
  ctx: RequestContext,
  database: InquiryDb,
  input: EmployeeManualBookingInput,
) {
  await requirePermission(ctx, PERMISSIONS.EVENTS_CREATE, database);
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const emailNormalized = normalizeInvitationEmail(input.email);
  const locationId = input.locationId || ctx.locationId || (await resolvePrimaryLocationId(database, ctx.organizationId));
  if (input.locationId) {
    const location = await database.location.findFirst({
      where: { id: input.locationId, organizationId: ctx.organizationId, active: true },
      select: { id: true },
    });
    if (!location) {
      throw new InquiryError("INVALID_INTAKE", "Choose a location in this organization.");
    }
  }
  const desiredDate = new Date(`${input.preferredDate}T00:00:00.000Z`);
  const inquiry = await database.inquiry.create({
    data: {
      organizationId: ctx.organizationId,
      locationId,
      status: INQUIRY_STATUSES.READY_FOR_HUMAN,
      source: INQUIRY_SOURCES.EMPLOYEE,
      customerFirstName: input.firstName.trim(),
      customerLastName: input.lastName.trim(),
      customerGroupName: input.customerGroupName?.trim() || null,
      customerEmail: input.email.trim(),
      customerEmailNormalized: emailNormalized,
      customerPhone: input.phone?.trim() || null,
      eventType: input.eventType,
      occasion: input.eventGoal?.trim() || null,
      eventGoal: input.eventGoal?.trim() || null,
      desiredDate,
      desiredStartTime: input.startTime,
      guestCount: input.guestCount,
      guestMix: input.guestMix ?? null,
      desiredDurationMinutes: input.desiredDurationMinutes,
      diningPreference: input.diningPreference ?? null,
      spacePreference: input.spacePreference ?? null,
      attractionInterestIds: input.attractionInterestIds ?? [],
      customerNotes: input.notes?.trim() || null,
      employeeInternalNotes: input.notes?.trim() || null,
      aiHandlingEnabled: false,
      salesStage: INQUIRY_SALES_STAGES.INQUIRY,
      workflowStage: INQUIRY_WORKFLOW_STAGES.AGENT_WORKING,
      assignedUserProfileId: ctx.userId,
      assignedAt: new Date(),
      audience: audienceFromGuestMix(input.guestMix),
      attractionMode: attractionModeFromIntake({
        attractionMode: input.attractionInterestIds && input.attractionInterestIds.length > 0 ? "known" : "recommend",
        attractionInterestIds: input.attractionInterestIds ?? [],
      }),
      internalSummary: "Employee-created booking. No public conversation.",
    },
  });
  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "inquiry.created",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: { source: INQUIRY_SOURCES.EMPLOYEE, publicConversation: false },
  });
  await generateEventPlansForInquiry(database, {
    organizationId: ctx.organizationId,
    inquiryId: inquiry.id,
  });
  const plans = await database.eventPlanRecommendation.findMany({
    where: {
      organizationId: ctx.organizationId,
      inquiryId: inquiry.id,
      kind: EVENT_PLAN_KINDS.RECOMMENDATION,
    },
    orderBy: { sortOrder: "asc" },
  });
  const selected =
    plans.find((row) => row.tier === EVENT_PLAN_TIERS.BEST_FIT) ??
    plans.find((row) => row.availabilityValidated) ??
    plans[0] ??
    null;
  if (selected) {
    await database.inquiry.update({
      where: { id: inquiry.id },
      data: {
        selectedEventPlanId: selected.id,
        customerSelectedAt: new Date(),
        salesStage: INQUIRY_SALES_STAGES.READY_TO_BOOK,
      },
    });
    await startWorkingInquiry(ctx, database, inquiry.id);
  }
  return { inquiryId: inquiry.id };
}

function formatIntakeMessage(input: {
  firstName: string;
  lastName: string;
  customerGroupName?: string;
  email: string;
  phone?: string;
  eventType?: string;
  eventGoal?: string;
  preferredDate?: string;
  startTime?: string;
  guestCount?: number;
  guestMix?: string;
  desiredDurationMinutes?: number;
  diningPreference?: string;
  spacePreference?: string;
  notes?: string;
}): string {
  const lines = [
    `${input.firstName} ${input.lastName} submitted an event inquiry.`,
    `Email: ${input.email}`,
  ];
  if (input.customerGroupName) lines.push(`Group: ${input.customerGroupName}`);
  if (input.phone) lines.push(`Phone: ${input.phone}`);
  if (input.eventType) lines.push(`Planning: ${input.eventType}`);
  if (input.eventGoal) lines.push(`Goal: ${input.eventGoal}`);
  if (input.preferredDate) lines.push(`Preferred date: ${input.preferredDate}`);
  if (input.startTime) lines.push(`Approximate start: ${input.startTime}`);
  if (input.guestCount) lines.push(`Guest count: ${input.guestCount}`);
  if (input.guestMix) lines.push(`Guest mix: ${input.guestMix}`);
  if (input.desiredDurationMinutes) lines.push(`Duration minutes: ${input.desiredDurationMinutes}`);
  if (input.diningPreference) lines.push(`Dining: ${input.diningPreference}`);
  if (input.spacePreference) lines.push(`Space: ${input.spacePreference}`);
  if (input.notes) lines.push(`Notes: ${input.notes}`);
  return lines.join("\n");
}
