import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { recordAuditEvent } from "@/server/services/audit";
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_KINDS,
  COMMUNICATION_SKIP_REASONS,
  COMMUNICATION_STATUSES,
} from "@/types/communications";
import { DOMAIN_EVENT_TYPES, type DomainEvent } from "@/server/domain-events/types";

type EventDb = PrismaClient;

export async function emitDomainEvent(database: EventDb, event: DomainEvent): Promise<void> {
  if (event.type === DOMAIN_EVENT_TYPES.EVENT_PLAN_SELECTED) {
    await onEventPlanSelected(database, event.payload);
    return;
  }
  await onBookingConfirmed(database, event.payload);
}

export async function onEventPlanSelected(
  database: EventDb,
  payload: Extract<DomainEvent, { type: typeof DOMAIN_EVENT_TYPES.EVENT_PLAN_SELECTED }>["payload"],
): Promise<void> {
  const draft = planSelectionConfirmationDraft(payload);
  await database.communicationEvent.create({
    data: {
      organizationId: payload.organizationId,
      channel: COMMUNICATION_CHANNELS.EMAIL,
      kind: COMMUNICATION_KINDS.PLAN_SELECTION_CONFIRMATION,
      status: COMMUNICATION_STATUSES.SKIPPED,
      skipReason: COMMUNICATION_SKIP_REASONS.NO_EMAIL_PROVIDER,
      toAddress: payload.customerEmail,
      subject: draft.subject,
      inquiryId: payload.inquiryId,
      payload: draft as Prisma.InputJsonValue,
    },
  });
  await recordAuditEvent(database, {
    organizationId: payload.organizationId,
    action: "communication.plan_selection_skipped",
    resourceType: "inquiry",
    resourceId: payload.inquiryId,
    metadata: {
      kind: COMMUNICATION_KINDS.PLAN_SELECTION_CONFIRMATION,
      skipReason: COMMUNICATION_SKIP_REASONS.NO_EMAIL_PROVIDER,
      selectedPlanId: payload.selectedPlanId,
    },
  });
}

export async function onBookingConfirmed(
  database: EventDb,
  payload: Extract<DomainEvent, { type: typeof DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED }>["payload"],
): Promise<void> {
  const draft = bookingConfirmationDraft(payload);
  await database.communicationEvent.create({
    data: {
      organizationId: payload.organizationId,
      channel: COMMUNICATION_CHANNELS.EMAIL,
      kind: COMMUNICATION_KINDS.BOOKING_CONFIRMATION,
      status: COMMUNICATION_STATUSES.SKIPPED,
      skipReason: payload.bookingId
        ? COMMUNICATION_SKIP_REASONS.NO_EMAIL_PROVIDER
        : COMMUNICATION_SKIP_REASONS.NO_BOOKING_RECORD,
      toAddress: payload.customerEmail ?? null,
      subject: draft.subject,
      inquiryId: payload.inquiryId ?? null,
      bookingId: payload.bookingId,
      payload: draft as Prisma.InputJsonValue,
    },
  });
  await recordAuditEvent(database, {
    organizationId: payload.organizationId,
    action: "communication.booking_confirmation_skipped",
    resourceType: "booking",
    resourceId: payload.bookingId,
    metadata: {
      kind: COMMUNICATION_KINDS.BOOKING_CONFIRMATION,
      skipReason: payload.bookingId
        ? COMMUNICATION_SKIP_REASONS.NO_EMAIL_PROVIDER
        : COMMUNICATION_SKIP_REASONS.NO_BOOKING_RECORD,
      inquiryId: payload.inquiryId ?? null,
    },
  });
}

export function bookingConfirmationDraft(payload: {
  organizationName?: string;
  bookingNumber?: string;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerGroupName?: string | null;
  eventDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  guestCount?: number | null;
  activities?: string[];
  dining?: string;
  spaces?: string[];
  totalCents?: number | null;
  currency?: string;
}): {
  subject: string;
  bookingNumber: string | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  guestCount: number | null;
  activities: string[];
  dining: string;
  spaces: string[];
  totalCents: number | null;
  currency: string | null;
  reserved: true;
} {
  const organizationName = payload.organizationName || "our venue";
  return {
    subject: `Your ${organizationName} Event Is Confirmed`,
    bookingNumber: payload.bookingNumber ?? null,
    eventDate: payload.eventDate ?? null,
    startTime: payload.startTime ?? null,
    endTime: payload.endTime ?? null,
    guestCount: payload.guestCount ?? null,
    activities: payload.activities ?? [],
    dining: payload.dining ?? "Dining to be confirmed",
    spaces: payload.spaces ?? [],
    totalCents: payload.totalCents ?? null,
    currency: payload.currency ?? null,
    reserved: true,
  };
}

export function planSelectionConfirmationDraft(payload: {
  organizationName: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerGroupName: string | null;
  eventDate: string | null;
  guestCount: number | null;
  planTitle: string;
  activities: string[];
  dining: string;
  spaces: string[];
  estimatedTotalCents: number | null;
  currency: string;
}): {
  subject: string;
  customerName: string;
  body: string;
  eventDate: string | null;
  planTitle: string;
  activities: string[];
  dining: string;
  spaces: string[];
  estimatedTotalCents: number | null;
  currency: string;
  reserved: false;
} {
  const customerName =
    [payload.customerFirstName, payload.customerLastName].filter(Boolean).join(" ").trim() ||
    payload.customerGroupName ||
    "there";
  const group = payload.customerGroupName ? ` for ${payload.customerGroupName}` : "";
  const dateBit = payload.eventDate ? ` on ${payload.eventDate}` : "";
  const guests = payload.guestCount ? `${payload.guestCount} guests` : "the guest count you shared";
  const activities = payload.activities.length > 0 ? payload.activities.join(", ") : "to be confirmed";
  const spaces = payload.spaces.length > 0 ? payload.spaces.join(", ") : "none specified";
  return {
    subject: `We received your ${payload.organizationName} event plan`,
    customerName,
    eventDate: payload.eventDate,
    planTitle: payload.planTitle,
    activities: payload.activities,
    dining: payload.dining,
    spaces: payload.spaces,
    estimatedTotalCents: payload.estimatedTotalCents,
    currency: payload.currency,
    reserved: false,
    body: `Thanks for choosing your event plan${group}. We’ve saved your preferences and sent them to our event team. A ${payload.organizationName} event specialist will review availability and reach out soon to help finalize your event.

Requested date${dateBit || ": to be confirmed"}
Guests: ${guests}
Selected plan: ${payload.planTitle}
Activities: ${activities}
Dining: ${payload.dining}
Space: ${spaces}

This is not a confirmed reservation. Final availability will be confirmed by our event team.`,
  };
}
