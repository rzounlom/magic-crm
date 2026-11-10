import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { createPublicConversationToken } from "@/lib/ai/public-conversation-token";
import { personalEventPlanNotification } from "@/lib/event-planner/email-context";
import { parseWpIntakeMessageMetadata } from "@/lib/event-planner/wp-intake-contract";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { createEmailProvider } from "@/server/communications/email-provider";
import { InquiryError } from "@/server/errors";
import {
  WP_KNOWN_CATALOG_DISCREPANCIES,
  applyWpStaffQuoteEdits,
  buildWpStaffQuoteDraft,
  readEmployeeApprovedQuoteMarker,
  readWpQuoteDraftProvenance,
  resolveWpCustomerQuoteDeliveryPolicy,
  toCustomerFacingWpQuotePayload,
  type WpParitySnapshot,
  type WpStaffQuoteLineEdit,
} from "@/server/event-planner/wp-parity";
import {
  buildWpDraftResourceRequirements,
  buildWpExclusiveRoomRequirements,
} from "@/server/event-planner/wp-parity/inventory-mapping";
import { resolveInquiryLocationId } from "@/server/locations/primary-location";
import { requirePermission, requirePermissions } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { recordAuditEvent } from "@/server/services/audit";
import { checkInquiryAvailability } from "@/server/services/live-agent-service";
import {
  EVENT_PLAN_KINDS,
  INQUIRY_SALES_STAGES,
  INQUIRY_STATUSES,
  INQUIRY_WORKFLOW_STAGES,
} from "@/types/inquiry";
import { EVENT_PLAN_TIERS, type EventPlanLineItem, type EventPlanPayload } from "@/types/event-planner";
import { PERMISSIONS } from "@/types/permissions";
import { PLAN_AVAILABILITY_STATUSES } from "@/types/resource-schedule";
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_KINDS,
  COMMUNICATION_SKIP_REASONS,
  COMMUNICATION_STATUSES,
} from "@/types/communications";

type Db = PrismaClient;

function findWpIntakeFromMessages(messages: Array<{ metadata?: unknown }> | undefined) {
  if (!messages?.length) {
    return null;
  }
  for (const message of messages) {
    const parsed = parseWpIntakeMessageMetadata(message.metadata);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function isValidWpSnapshot(value: unknown): value is Extract<WpParitySnapshot, { valid: true }> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as { valid?: unknown; dates?: unknown };
  return record.valid === true && Array.isArray(record.dates);
}

/**
 * Staff edits submit the full ordered line list. Compare by index so duplicate WP
 * product slugs (common when guessProductSlug collapses labels) cannot false-positive
 * a quantity-only edit as a unit-price override.
 */
function isUnitPriceOverride(
  previous: EventPlanLineItem[] | undefined,
  next: WpStaffQuoteLineEdit[],
): boolean {
  const prior = previous ?? [];
  for (let index = 0; index < next.length; index += 1) {
    const row = next[index]!;
    const match = prior[index];
    if (match && match.unitPriceCents !== row.unitPriceCents) {
      return true;
    }
  }
  return false;
}

async function attachWpInventoryRequirements(
  database: Db,
  organizationId: string,
  payload: EventPlanPayload,
  selectedAttractions: readonly string[],
): Promise<EventPlanPayload> {
  const resourceTypes = await database.resourceType.findMany({
    where: { organizationId, active: true },
    select: {
      id: true,
      slug: true,
      name: true,
      inventoryConfigured: true,
      active: true,
    },
  });
  const mapped = buildWpDraftResourceRequirements({
    selectedAttractions: selectedAttractions as Array<
      "bowling" | "axe" | "laser" | "golf" | "climbing" | "arcade"
    >,
    guestCount: payload.guestCount,
    durationMinutes: payload.durationMinutes,
    resourceTypes,
  });
  const provenance = readWpQuoteDraftProvenance(payload);
  const rooms = buildWpExclusiveRoomRequirements({
    exclusiveRooms: provenance?.exclusiveRooms ?? [],
    durationMinutes: payload.durationMinutes,
    resourceTypes,
    existingRequirements: mapped.requirements,
  });
  const notes = [...(payload.adjustmentNote ? [payload.adjustmentNote] : [])];
  if (mapped.unmappedReservableAttractions.length > 0) {
    notes.push(
      `Unmapped reservable attractions (inventory not configured): ${mapped.unmappedReservableAttractions.join(", ")}.`,
    );
  }
  if (rooms.unmappedExclusiveRooms.length > 0) {
    notes.push(
      `Unmapped exclusive rooms (inventory not configured): ${rooms.unmappedExclusiveRooms.join(", ")}.`,
    );
  }
  if ((provenance?.pricingOnlyRoomAdjustments.length ?? 0) > 0) {
    notes.push(
      `Room pricing adjustments (no extra inventory units): ${provenance!.pricingOnlyRoomAdjustments.join("; ")}.`,
    );
  }
  return {
    ...payload,
    resourceRequirements: [...mapped.requirements, ...rooms.requirements],
    adjustmentNote: notes.length > 0 ? notes.join(" ") : payload.adjustmentNote,
  };
}

async function loadMagicCatalogCentsBySlug(
  database: Db,
  organizationId: string,
): Promise<Map<string, number>> {
  const slugs = [...new Set(WP_KNOWN_CATALOG_DISCREPANCIES.map((row) => row.productSlug))];
  const products = await database.product.findMany({
    where: { organizationId, slug: { in: slugs } },
    select: {
      slug: true,
      prices: {
        select: { amountCents: true, additionalHourCents: true },
        take: 4,
      },
    },
  });
  const map = new Map<string, number>();
  for (const product of products) {
    const price = product.prices[0];
    if (!price) {
      continue;
    }
    if (product.slug === "lower-event-room" && typeof price.additionalHourCents === "number") {
      map.set(product.slug, price.additionalHourCents);
      continue;
    }
    map.set(product.slug, price.amountCents);
  }
  return map;
}

/**
 * Convert a private WP-parity snapshot into an editable AGENT_WORKING quote draft.
 * Does not create RECOMMENDATION rows, send email, hold inventory, or create bookings/payments.
 * Does not advance salesStage past INQUIRY.
 */
export async function createWpStaffQuoteDraftFromInquiry(
  ctx: RequestContext,
  database: Db,
  inquiryId: string,
  options?: { date?: string },
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);

  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId: ctx.organizationId },
    include: {
      eventPlanRecommendations: true,
      conversations: {
        include: { messages: { orderBy: { createdAt: "asc" } } },
        take: 1,
      },
    },
  });
  if (!inquiry) {
    throw new InquiryError("INQUIRY_NOT_FOUND");
  }
  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    throw new InquiryError("INQUIRY_ALREADY_BOOKED");
  }

  const wpIntake = findWpIntakeFromMessages(inquiry.conversations[0]?.messages);
  if (!wpIntake) {
    throw new InquiryError(
      "WORKING_PLAN_INVALID",
      "This inquiry has no WordPress intake calculation to convert.",
    );
  }
  const snapshot = wpIntake.privateCalculation.snapshot;
  if (!isValidWpSnapshot(snapshot) || wpIntake.privateCalculation.status !== "ready") {
    throw new InquiryError(
      "WORKING_PLAN_INVALID",
      "Private WordPress calculation is not ready. Review pricing configuration first.",
    );
  }

  const locationId = await resolveInquiryLocationId(database, inquiry);
  const magicCatalogCentsBySlug = await loadMagicCatalogCentsBySlug(database, ctx.organizationId);
  const built = buildWpStaffQuoteDraft({
    organizationId: ctx.organizationId,
    locationId,
    snapshot,
    date: options?.date,
    magicCatalogCentsBySlug,
  });
  if (!built.ok) {
    throw new InquiryError("WORKING_PLAN_INVALID", built.error);
  }

  const payloadWithInventory = await attachWpInventoryRequirements(
    database,
    ctx.organizationId,
    built.draft.payload,
    built.provenance.selectedAttractions,
  );

  const existingWorking = inquiry.eventPlanRecommendations.find(
    (row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING,
  );
  const draftData = {
    organizationId: ctx.organizationId,
    inquiryId: inquiry.id,
    kind: EVENT_PLAN_KINDS.AGENT_WORKING,
    tier: built.draft.tier,
    title: built.draft.title,
    sortOrder: built.draft.sortOrder,
    estimatedTotalCents: built.draft.estimatedTotalCents,
    currency: built.draft.currency,
    guestCount: built.draft.guestCount,
    durationMinutes: built.draft.durationMinutes,
    customerFacingReason: built.draft.customerFacingReason,
    availabilityValidated: built.draft.availabilityValidated,
    availabilityNote: built.draft.availabilityNote,
    availabilityStatus: built.draft.availabilityStatus ?? "NOT_VALIDATED",
    availabilityCheckedAt: null as Date | null,
    payload: payloadWithInventory as object,
  };

  const working = existingWorking
    ? await database.eventPlanRecommendation.update({
        where: { id: existingWorking.id },
        data: {
          tier: draftData.tier,
          title: draftData.title,
          sortOrder: draftData.sortOrder,
          estimatedTotalCents: draftData.estimatedTotalCents,
          currency: draftData.currency,
          guestCount: draftData.guestCount,
          durationMinutes: draftData.durationMinutes,
          customerFacingReason: draftData.customerFacingReason,
          availabilityValidated: draftData.availabilityValidated,
          availabilityNote: draftData.availabilityNote,
          availabilityStatus: draftData.availabilityStatus,
          availabilityCheckedAt: null,
          payload: draftData.payload,
        },
      })
    : await database.eventPlanRecommendation.create({ data: draftData });

  // Keep salesStage at INQUIRY — this is not a customer-facing proposal.
  const salesStage =
    inquiry.salesStage === INQUIRY_SALES_STAGES.PROPOSAL_READY ||
    inquiry.salesStage === INQUIRY_SALES_STAGES.READY_TO_BOOK
      ? INQUIRY_SALES_STAGES.INQUIRY
      : (inquiry.salesStage ?? INQUIRY_SALES_STAGES.INQUIRY);

  await database.inquiry.update({
    where: { id: inquiry.id },
    data: {
      selectedEventPlanId: working.id,
      agentWorkingPlanId: working.id,
      workflowStage: INQUIRY_WORKFLOW_STAGES.AGENT_WORKING,
      salesStage,
      status: INQUIRY_STATUSES.READY_FOR_HUMAN,
      humanHandoffReason: inquiry.humanHandoffReason ?? READY_FOR_HUMAN_REASONS.PUBLIC_EVENT_REQUEST,
      aiHandlingEnabled: false,
      assignedUserProfileId: inquiry.assignedUserProfileId ?? ctx.userId,
      assignedAt: inquiry.assignedAt ?? new Date(),
    },
  });

  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: existingWorking ? "inquiry.wp_quote_draft_refreshed" : "inquiry.wp_quote_draft_created",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: {
      eventPlanRecommendationId: working.id,
      pricingSource: built.provenance.pricingSource,
      totalCents: built.provenance.totalCents,
      planDate: built.provenance.planDate,
    },
  });

  return {
    inquiryId: inquiry.id,
    planId: working.id,
    estimatedTotalCents: working.estimatedTotalCents,
    provenance: built.provenance,
    refreshed: Boolean(existingWorking),
  };
}

async function loadWpWorkingDraft(database: Db, organizationId: string, inquiryId: string) {
  const inquiry = await database.inquiry.findFirst({
    where: { id: inquiryId, organizationId },
    include: {
      eventPlanRecommendations: true,
      conversations: {
        include: { messages: { orderBy: { createdAt: "asc" } } },
        take: 1,
      },
      organization: { select: { name: true, customerFacingName: true, currency: true } },
    },
  });
  if (!inquiry) {
    throw new InquiryError("INQUIRY_NOT_FOUND");
  }
  if (inquiry.status === INQUIRY_STATUSES.BOOKED) {
    throw new InquiryError("INQUIRY_ALREADY_BOOKED");
  }
  const working =
    inquiry.eventPlanRecommendations.find((row) => row.id === inquiry.agentWorkingPlanId) ??
    inquiry.eventPlanRecommendations.find((row) => row.kind === EVENT_PLAN_KINDS.AGENT_WORKING);
  if (!working) {
    throw new InquiryError("WORKING_PLAN_INVALID", "Create a staff quote draft first.");
  }
  const provenance = readWpQuoteDraftProvenance(working.payload);
  if (!provenance) {
    throw new InquiryError("WORKING_PLAN_INVALID", "Working plan is not a WordPress staff quote draft.");
  }
  const wpIntake = findWpIntakeFromMessages(inquiry.conversations[0]?.messages);
  return { inquiry, working, provenance, wpIntake };
}

/**
 * Explicit staff edits to WP quote line items / schedule. Never looks up MagiCRM catalog prices.
 */
export async function updateWpStaffQuoteDraft(
  ctx: RequestContext,
  database: Db,
  inquiryId: string,
  input: {
    guestCount: number;
    eventDate: string | null;
    startTime: string | null;
    durationMinutes: number;
    lineItems: WpStaffQuoteLineEdit[];
    adjustmentNote?: string | null;
    editReason: string;
  },
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  const { inquiry, working, provenance } = await loadWpWorkingDraft(
    database,
    ctx.organizationId,
    inquiryId,
  );
  const previousPayload = working.payload as EventPlanPayload;
  if (isUnitPriceOverride(previousPayload.lineItems, input.lineItems)) {
    await requirePermission(ctx, PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE, database);
  }
  const applied = applyWpStaffQuoteEdits({
    payload: previousPayload,
    guestCount: input.guestCount,
    eventDate: input.eventDate,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    lineItems: input.lineItems,
    adjustmentNote: input.adjustmentNote,
    editedByUserProfileId: ctx.userId,
    editReason: input.editReason,
  });
  if (!applied.ok) {
    throw new InquiryError("WORKING_PLAN_INVALID", applied.error);
  }

  const payloadWithInventory = await attachWpInventoryRequirements(
    database,
    ctx.organizationId,
    applied.payload,
    provenance.selectedAttractions,
  );

  const updated = await database.eventPlanRecommendation.update({
    where: { id: working.id },
    data: {
      estimatedTotalCents: applied.estimatedTotalCents,
      guestCount: input.guestCount,
      durationMinutes: input.durationMinutes,
      availabilityValidated: false,
      availabilityStatus: PLAN_AVAILABILITY_STATUSES.NOT_VALIDATED,
      availabilityNote: "Availability re-check required after staff quote edits.",
      availabilityCheckedAt: null,
      title: working.title.startsWith("Staff draft")
        ? working.title
        : `Staff draft — edited`,
      payload: payloadWithInventory as object,
    },
  });

  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "inquiry.wp_quote_draft_edited",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: {
      eventPlanRecommendationId: updated.id,
      totalCents: applied.estimatedTotalCents,
      reason: input.editReason.trim(),
    },
  });

  return {
    planId: updated.id,
    estimatedTotalCents: updated.estimatedTotalCents,
    provenance: readWpQuoteDraftProvenance(updated.payload),
  };
}

export async function checkWpStaffQuoteAvailability(
  ctx: RequestContext,
  database: Db,
  inquiryId: string,
) {
  await requirePermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, database);
  await loadWpWorkingDraft(database, ctx.organizationId, inquiryId);
  return checkInquiryAvailability(ctx, database, inquiryId);
}

/**
 * Employee approve (+ optional customer delivery when pricing policy allows).
 * Never creates inventory holds. Never auto-runs on inquiry submit.
 */
export async function approveAndSendWpStaffQuote(
  ctx: RequestContext,
  database: Db,
  inquiryId: string,
  input?: { approvalNote?: string | null; forceResend?: boolean },
) {
  await requirePermissions(
    ctx,
    [PERMISSIONS.CRM_INQUIRIES_MANAGE, PERMISSIONS.CRM_QUOTES_APPROVE],
    database,
  );
  const { inquiry, working, provenance, wpIntake } = await loadWpWorkingDraft(
    database,
    ctx.organizationId,
    inquiryId,
  );

  const email = inquiry.customerEmail?.trim();
  if (!email || !email.includes("@")) {
    throw new InquiryError("INVALID_INTAKE", "Customer email is required before sending a quote.");
  }

  const policy = resolveWpCustomerQuoteDeliveryPolicy(
    wpIntake?.privateCalculation ?? {
      status: "ready" as const,
      pricingSource:
        provenance.pricingSource === "tenant_live" ||
        provenance.pricingSource === "approved_plugin_baseline" ||
        provenance.pricingSource === "plugin_defaults" ||
        provenance.pricingSource === "incomplete"
          ? provenance.pricingSource
          : "plugin_defaults",
    },
  );
  if (!policy.canApprove) {
    throw new InquiryError("WORKING_PLAN_INVALID", policy.message);
  }

  const availability = await checkInquiryAvailability(ctx, database, inquiryId);
  const refreshedWorking = await database.eventPlanRecommendation.findFirstOrThrow({
    where: { id: working.id, organizationId: ctx.organizationId },
  });
  if (refreshedWorking.availabilityStatus === PLAN_AVAILABILITY_STATUSES.UNAVAILABLE) {
    throw new InquiryError(
      "WORKING_PLAN_INVALID",
      `Availability conflict: ${availability.conflictLabels.join(", ") || availability.note}. Resolve conflicts before approving the quote.`,
    );
  }

  const availabilityConfirmed =
    refreshedWorking.availabilityValidated &&
    refreshedWorking.availabilityStatus === PLAN_AVAILABILITY_STATUSES.AVAILABLE;
  const availabilityNote = availabilityConfirmed
    ? refreshedWorking.availabilityNote || "Resources checked available at quote time."
    : refreshedWorking.availabilityNote ||
      "Resource availability could not be fully validated from this WordPress draft. Final availability will be confirmed by our event team.";

  const approvedAt = new Date().toISOString();
  const workingPayload = refreshedWorking.payload as EventPlanPayload;
  const priorApproval = readWpQuoteDraftProvenance(workingPayload)?.employeeApproval;

  // Idempotent delivery short-circuit.
  const existingCustomerQuote = inquiry.eventPlanRecommendations.find(
    (row) =>
      row.kind === EVENT_PLAN_KINDS.RECOMMENDATION &&
      readEmployeeApprovedQuoteMarker(row.payload),
  );
  if (
    existingCustomerQuote &&
    priorApproval?.deliveryCompleted &&
    !input?.forceResend &&
    existingCustomerQuote.estimatedTotalCents === refreshedWorking.estimatedTotalCents
  ) {
    return {
      approved: true,
      delivered: true,
      idempotent: true,
      planId: existingCustomerQuote.id,
      workingPlanId: working.id,
      estimatedTotalCents: existingCustomerQuote.estimatedTotalCents,
      policy,
      planPath: null as string | null,
      planUrl: null as string | null,
      message: "Quote was already approved and delivered. No duplicate send.",
    };
  }

  const nextProvenance = {
    ...provenance,
    ...readWpQuoteDraftProvenance(workingPayload),
    employeeApproval: {
      approvedAt,
      approvedByUserProfileId: ctx.userId,
      note: input?.approvalNote?.trim() || null,
      deliveryAttempted: policy.canDeliver,
      deliveryCompleted: false,
      deliveryBlockedCode: policy.canDeliver ? null : policy.code,
      deliveryBlockedMessage: policy.canDeliver ? null : policy.message,
    },
  } as NonNullable<ReturnType<typeof readWpQuoteDraftProvenance>>;

  await database.eventPlanRecommendation.update({
    where: { id: working.id },
    data: {
      payload: {
        ...workingPayload,
        wpQuoteDraft: nextProvenance,
      } as object,
    },
  });

  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "inquiry.wp_quote_approved",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: {
      workingPlanId: working.id,
      totalCents: refreshedWorking.estimatedTotalCents,
      pricingSource: provenance.pricingSource,
      deliveryAllowed: policy.canDeliver,
      deliveryCode: policy.code,
      availabilityConfirmed,
      availabilityStatus: refreshedWorking.availabilityStatus,
    },
  });

  if (!policy.canDeliver) {
    return {
      approved: true,
      delivered: false,
      idempotent: false,
      planId: null as string | null,
      workingPlanId: working.id,
      estimatedTotalCents: refreshedWorking.estimatedTotalCents,
      policy,
      planPath: null as string | null,
      planUrl: null as string | null,
      message: policy.message,
    };
  }

  // Customer delivery also requires the communications send permission.
  await requirePermission(ctx, PERMISSIONS.COMMUNICATIONS_SEND, database);

  const customerPayload = toCustomerFacingWpQuotePayload({
    workingPayload: {
      ...workingPayload,
      wpQuoteDraft: nextProvenance,
    },
    approvedAt,
    availabilityConfirmed,
    availabilityNote,
  });

  const recommendationData = {
    organizationId: ctx.organizationId,
    inquiryId: inquiry.id,
    kind: EVENT_PLAN_KINDS.RECOMMENDATION,
    tier: EVENT_PLAN_TIERS.BEST_FIT,
    title: provenance.planName || "Your event quote",
    sortOrder: 0,
    estimatedTotalCents: refreshedWorking.estimatedTotalCents ?? 0,
    currency: refreshedWorking.currency || inquiry.organization.currency || "USD",
    guestCount: refreshedWorking.guestCount,
    durationMinutes: refreshedWorking.durationMinutes,
    customerFacingReason:
      "Employee-approved quote prepared from your event request. This is not a confirmed reservation.",
    availabilityValidated: availabilityConfirmed,
    availabilityNote,
    availabilityStatus: refreshedWorking.availabilityStatus ?? PLAN_AVAILABILITY_STATUSES.NOT_VALIDATED,
    availabilityCheckedAt: refreshedWorking.availabilityCheckedAt,
    payload: customerPayload as object,
  };

  const published = existingCustomerQuote
    ? await database.eventPlanRecommendation.update({
        where: { id: existingCustomerQuote.id },
        data: recommendationData,
      })
    : await database.eventPlanRecommendation.create({ data: recommendationData });

  // Rotate conversation token so staff can share a fresh /plan link (WP thank-you never published plans).
  const conversation = inquiry.conversations[0];
  if (!conversation) {
    throw new InquiryError("CONVERSATION_NOT_FOUND");
  }
  const { token, hash } = createPublicConversationToken();
  await database.conversation.update({
    where: { id: conversation.id },
    data: { publicTokenHash: hash },
  });

  const planPath = `/plan/${token}`;
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) {
    throw new InquiryError(
      "WORKING_PLAN_INVALID",
      "APP_URL is not configured, so a customer quote link cannot be created.",
    );
  }
  const displayOrganizationName = customerFacingOrganizationName(inquiry.organization);
  const notification = personalEventPlanNotification({
    customerEmail: email,
    customerFirstName: inquiry.customerFirstName,
    customerLastName: inquiry.customerLastName,
    organizationName: displayOrganizationName,
    planPath,
    appUrl,
    eventDate: customerPayload.eventDate,
  });

  const idempotencyKey = `employee_approved_quote:${inquiry.id}:${published.id}:${published.estimatedTotalCents}`;
  const existingComm = await database.communicationEvent.findFirst({
    where: {
      organizationId: ctx.organizationId,
      inquiryId: inquiry.id,
      kind: COMMUNICATION_KINDS.EMPLOYEE_APPROVED_QUOTE,
    },
    orderBy: { createdAt: "desc" },
  });
  const existingKey =
    existingComm?.payload && typeof existingComm.payload === "object"
      ? (existingComm.payload as { idempotencyKey?: string }).idempotencyKey
      : null;

  let emailStatus: (typeof COMMUNICATION_STATUSES)[keyof typeof COMMUNICATION_STATUSES] =
    COMMUNICATION_STATUSES.SKIPPED;
  let skipReason: string | null = COMMUNICATION_SKIP_REASONS.NO_EMAIL_PROVIDER;
  let providerMessageId: string | null = null;
  let emailProviderName = "none";

  if (!input?.forceResend && existingKey === idempotencyKey) {
    emailStatus =
      (existingComm?.status as (typeof COMMUNICATION_STATUSES)[keyof typeof COMMUNICATION_STATUSES] | undefined) ??
      COMMUNICATION_STATUSES.SKIPPED;
    skipReason = existingComm?.skipReason ?? skipReason;
    providerMessageId = existingComm?.providerMessageId ?? null;
  } else {
    const provider = createEmailProvider();
    emailProviderName = provider.name;
    const sendResult = await provider.send({
      to: email,
      subject: `Your ${displayOrganizationName} event quote`,
      textBody: `Your quote is ready: ${notification.planUrl}`,
      idempotencyKey,
      metadata: {
        inquiryId: inquiry.id,
        planId: published.id,
        estimatedTotalCents: published.estimatedTotalCents ?? 0,
      },
    });
    emailStatus = sendResult.status;
    skipReason = sendResult.status === COMMUNICATION_STATUSES.SKIPPED ? sendResult.skipReason : null;
    providerMessageId =
      sendResult.status === COMMUNICATION_STATUSES.SENT ? sendResult.providerMessageId : null;

    await database.communicationEvent.create({
      data: {
        organizationId: ctx.organizationId,
        channel: COMMUNICATION_CHANNELS.EMAIL,
        kind: COMMUNICATION_KINDS.EMPLOYEE_APPROVED_QUOTE,
        status: emailStatus,
        skipReason,
        toAddress: email,
        subject: `Your ${displayOrganizationName} event quote`,
        inquiryId: inquiry.id,
        providerMessageId,
        sentAt: emailStatus === COMMUNICATION_STATUSES.SENT ? new Date() : null,
        payload: {
          ...notification,
          planId: published.id,
          estimatedTotalCents: published.estimatedTotalCents,
          approvedAt,
          reserved: false,
          idempotencyKey,
          emailProvider: emailProviderName,
        } as Prisma.InputJsonValue,
      },
    });
  }

  await database.inquiry.update({
    where: { id: inquiry.id },
    data: {
      salesStage: INQUIRY_SALES_STAGES.PROPOSAL_READY,
      status: INQUIRY_STATUSES.AWAITING_CUSTOMER,
      recommendationsGeneratedAt: new Date(),
      agentWorkingPlanId: working.id,
      // Customer has not accepted yet — keep selection on the working draft for staff.
      selectedEventPlanId: working.id,
    },
  });

  await database.eventPlanRecommendation.update({
    where: { id: working.id },
    data: {
      payload: {
        ...workingPayload,
        wpQuoteDraft: {
          ...nextProvenance,
          employeeApproval: {
            ...nextProvenance.employeeApproval!,
            deliveryAttempted: true,
            deliveryCompleted: true,
            deliveryBlockedCode: null,
            deliveryBlockedMessage: null,
          },
        },
      } as object,
    },
  });

  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "inquiry.wp_quote_delivered",
    resourceType: "inquiry",
    resourceId: inquiry.id,
    metadata: {
      recommendationId: published.id,
      workingPlanId: working.id,
      planUrl: notification.planUrl,
      emailStatus,
      skipReason,
      emailProvider: emailProviderName,
      totalCents: published.estimatedTotalCents,
    },
  });

  if (emailStatus === COMMUNICATION_STATUSES.SKIPPED) {
    await recordAuditEvent(database, {
      organizationId: ctx.organizationId,
      actorUserProfileId: ctx.userId,
      action: "communication.employee_approved_quote_skipped",
      resourceType: "inquiry",
      resourceId: inquiry.id,
      metadata: {
        kind: COMMUNICATION_KINDS.EMPLOYEE_APPROVED_QUOTE,
        skipReason,
        planId: published.id,
        emailProvider: emailProviderName,
      },
    });
  } else if (emailStatus === COMMUNICATION_STATUSES.FAILED) {
    await recordAuditEvent(database, {
      organizationId: ctx.organizationId,
      actorUserProfileId: ctx.userId,
      action: "communication.employee_approved_quote_failed",
      resourceType: "inquiry",
      resourceId: inquiry.id,
      metadata: {
        kind: COMMUNICATION_KINDS.EMPLOYEE_APPROVED_QUOTE,
        planId: published.id,
        emailProvider: emailProviderName,
        providerMessageId,
      },
    });
  }

  return {
    approved: true,
    delivered: true,
    idempotent: false,
    planId: published.id,
    workingPlanId: working.id,
    estimatedTotalCents: published.estimatedTotalCents,
    policy,
    planPath,
    planUrl: notification.planUrl,
    message:
      emailStatus === COMMUNICATION_STATUSES.SENT
        ? "Quote approved, published, and emailed via the configured local/dev provider."
        : "Quote approved and published for the customer. Email provider is not live — notification was recorded as skipped (no customer email sent).",
  };
}
