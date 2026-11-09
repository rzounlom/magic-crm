import type { PrismaClient } from "@/generated/prisma/client";

import { parseWpIntakeMessageMetadata } from "@/lib/event-planner/wp-intake-contract";
import { READY_FOR_HUMAN_REASONS } from "@/lib/inquiries/ready-for-human-reason";
import { InquiryError } from "@/server/errors";
import {
  WP_KNOWN_CATALOG_DISCREPANCIES,
  buildWpStaffQuoteDraft,
  type WpParitySnapshot,
} from "@/server/event-planner/wp-parity";
import { resolveInquiryLocationId } from "@/server/locations/primary-location";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import { recordAuditEvent } from "@/server/services/audit";
import {
  EVENT_PLAN_KINDS,
  INQUIRY_SALES_STAGES,
  INQUIRY_STATUSES,
  INQUIRY_WORKFLOW_STAGES,
} from "@/types/inquiry";
import { PERMISSIONS } from "@/types/permissions";

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
    payload: built.draft.payload as object,
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
