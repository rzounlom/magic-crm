/**
 * Phase 9C — synthetic WordPress quote → pending → confirm → deposit/balance path.
 * Uses isolated test DB only. Does not touch Production records or live email.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";
import { assertApprovedQuoteAmountsConsistent } from "@/lib/inquiries/approved-quote-amounts";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import {
  parseWpIntakeMessageMetadata,
  type WpIntakeMessageMetadata,
} from "@/lib/event-planner/wp-intake-contract";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { depositPercentFromTenant, depositRequiredCents } from "@/server/catalog/pricing";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { AuthorizationError } from "@/server/errors";
import {
  readEmployeeApprovedQuoteMarker,
  readWpQuoteDraftProvenance,
} from "@/server/event-planner/wp-parity";
import { resolveRequestContext } from "@/server/request-context";
import { importBookingCatalog } from "@/server/services/catalog-import-service";
import { createPublicWpEventInquiry } from "@/server/services/inquiry-service";
import {
  confirmPendingBooking,
  upsertPendingBookingFromPlan,
} from "@/server/services/pending-booking-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import {
  approveAndSendWpStaffQuote,
  createWpStaffQuoteDraftFromInquiry,
  updateWpStaffQuoteDraft,
} from "@/server/services/wp-staff-quote-draft-service";
import { BOOKING_STATUSES } from "@/types/booking";
import { COMMUNICATION_KINDS } from "@/types/communications";
import { EVENT_PLAN_KINDS, INQUIRY_STATUSES } from "@/types/inquiry";
import { RESOURCE_RESERVATION_STATUSES } from "@/types/resource-schedule";
import { authorizeUnconfiguredHoursForConfirm } from "../helpers/authorize-test-hours-exception";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { futureEventDate } from "../helpers/future-event-date";
import { createTestPrismaClient } from "../helpers/test-database";

const EVENT_DATE = futureEventDate(42);
const START_TIME = "14:00";
const DURATION_MINUTES = 180;
const DEPOSIT_PERCENT = 50;
const SALAD_UNIT_CENTS = 2499;
const LOWER_ROOM_CENTS = 15_000;
const LOWER_EXTRA_CENTS = 7500;
const CATALOG_SALAD_CENTS = 1999;
const CATALOG_LOWER_EXTRA_CENTS = 5000;

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];
const unlimitedLimiter = createMemoryRateLimiter();

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
});

afterAll(async () => {
  await db.$disconnect();
});

async function provisionTenant(suffix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_wp_fin_${suffix}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_wp_fin_${suffix}_${crypto.randomUUID()}`,
      organizationName: `WP Financial ${suffix}`,
      organizationSlug: `wp-fin-${suffix}-${crypto.randomUUID()}`,
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

async function configureTenantDeposit(organizationId: string) {
  // Catalog import may overwrite depositPercent — apply the fixture policy after import.
  return db.organization.update({
    where: { id: organizationId },
    data: { depositPercent: DEPOSIT_PERCENT },
  });
}

async function addGroupUser(
  tenant: Awaited<ReturnType<typeof provisionTenant>>,
  systemKey: string,
  emailPrefix: string,
) {
  const group = await db.securityGroup.findFirstOrThrow({
    where: { organizationId: tenant.organizationId, systemKey },
  });
  const user = await db.userProfile.create({
    data: {
      organizationId: tenant.organizationId,
      clerkUserId: `user_${crypto.randomUUID()}`,
      defaultLocationId: tenant.locationId,
      email: `${emailPrefix}-${crypto.randomUUID()}@example.test`,
      firstName: emailPrefix,
      lastName: "User",
    },
  });
  await db.securityGroupMember.create({
    data: {
      organizationId: tenant.organizationId,
      securityGroupId: group.id,
      userProfileId: user.id,
    },
  });
  const ctx = await resolveRequestContext(
    {
      clerkUserId: user.clerkUserId,
      clerkOrganizationId: tenant.organization.clerkOrganizationId,
    },
    db,
  );
  return { user, ctx };
}

async function setPrivatePricingSource(
  inquiryId: string,
  pricingSource: "approved_plugin_baseline" | "tenant_live" | "plugin_defaults",
) {
  const message = await db.conversationMessage.findFirstOrThrow({
    where: { conversation: { inquiryId }, senderType: "CUSTOMER" },
    orderBy: { createdAt: "asc" },
  });
  const meta = parseWpIntakeMessageMetadata(message.metadata);
  expect(meta).toBeTruthy();
  const next: WpIntakeMessageMetadata = {
    ...meta!,
    privateCalculation: {
      ...meta!.privateCalculation,
      pricingSource,
      status: "ready",
    },
  };
  await db.conversationMessage.update({
    where: { id: message.id },
    data: { metadata: next as unknown as Prisma.InputJsonValue },
  });
}

function financialFixtureLines() {
  const saladQty = 2;
  const saladTotal = saladQty * SALAD_UNIT_CENTS;
  const roomTotal = LOWER_ROOM_CENTS;
  const extraTotal = LOWER_EXTRA_CENTS;
  const bowlingUnit = 3000;
  const bowlingQty = 2;
  const bowlingTotal = bowlingUnit * bowlingQty;
  const subtotal = saladTotal + roomTotal + extraTotal + bowlingTotal;
  const tax = Math.round(saladTotal * 0.07);
  const total = subtotal + tax;
  return {
    lineItems: [
      {
        slug: "bowling-1h",
        name: "Bowling lanes",
        quantity: bowlingQty,
        unitPriceCents: bowlingUnit,
        kind: "WP_LINE",
      },
      {
        slug: "lower-event-room",
        name: "Lower Event Room",
        quantity: 1,
        unitPriceCents: LOWER_ROOM_CENTS,
        kind: "WP_LINE",
      },
      {
        slug: "lower-event-room-extra",
        name: "Lower Event Room additional hour",
        quantity: 1,
        unitPriceCents: LOWER_EXTRA_CENTS,
        kind: "WP_LINE",
      },
      {
        slug: "salad-pan",
        name: "Salad pan",
        quantity: saladQty,
        unitPriceCents: SALAD_UNIT_CENTS,
        kind: "WP_LINE",
      },
      {
        slug: "wp-tax-fb",
        name: "Food & beverage tax (7%)",
        quantity: 1,
        unitPriceCents: tax,
        kind: "TAX",
      },
    ],
    totalCents: total,
    taxCents: tax,
    subtotalCents: subtotal,
  };
}

describe("WP financial lifecycle E2E (Phase 9C)", () => {
  it("preserves WP salad and lower_extra cents through pending, confirm, deposit, and partial payment", async () => {
    const tenant = await provisionTenant("e2e");
    await importBookingCatalog(db, {
      organizationSlug: tenant.organization.slug,
      dataset: loadBookingCatalogDataset(),
    });
    const organization = await configureTenantDeposit(tenant.organizationId);
    expect(organization.depositPercent).toBe(DEPOSIT_PERCENT);

    const holdsBeforeInquiry = await db.resourceReservation.count({
      where: { organizationId: tenant.organizationId },
    });

    const created = await createPublicWpEventInquiry(
      db,
      {
        organizationSlug: tenant.organization.slug,
        rateLimitKey: `${tenant.organization.slug}:fin`,
        firstName: "Fin",
        lastName: "Ance",
        company: "Financial Co",
        phone: "5745550177",
        email: `fin.${crypto.randomUUID()}@example.test`,
        eventType: "Corporate or Team Event",
        dates: [EVENT_DATE],
        time: START_TIME,
        adults: 10,
        children: 0,
        duration: "3 hours",
        attractions: {
          bowling: "yes",
          axe: "no",
          laser: "no",
          golf: "no",
          climbing: "no",
          arcade: "no",
        },
        food: "yes",
        privateRoom: "yes",
        craft: "no",
        hasBudget: "no",
        description: "Financial lifecycle fixture",
        comments: null,
        referral: "QA",
        submissionId: `sub_fin_${crypto.randomUUID()}`,
      },
      unlimitedLimiter,
    );

    expect(
      await db.resourceReservation.count({ where: { organizationId: tenant.organizationId } }),
    ).toBe(holdsBeforeInquiry);

    await setPrivatePricingSource(created.inquiryId, "tenant_live");
    const draft = await createWpStaffQuoteDraftFromInquiry(tenant.ctx, db, created.inquiryId);
    const workingBefore = await db.eventPlanRecommendation.findFirstOrThrow({
      where: { id: draft.planId, kind: EVENT_PLAN_KINDS.AGENT_WORKING },
    });
    const beforePayload = readEventPlanPayload(workingBefore.payload);
    expect(readWpQuoteDraftProvenance(workingBefore.payload)).toBeTruthy();
    expect(
      await db.resourceReservation.count({
        where: {
          organizationId: tenant.organizationId,
          status: RESOURCE_RESERVATION_STATUSES.HOLD,
        },
      }),
    ).toBe(0);

    const sales = await addGroupUser(tenant, SYSTEM_GROUP_KEYS.EVENT_SALES, "sales");
    const fixture = financialFixtureLines();
    await expect(
      updateWpStaffQuoteDraft(sales.ctx, db, created.inquiryId, {
        guestCount: beforePayload.guestCount,
        eventDate: EVENT_DATE,
        startTime: START_TIME,
        durationMinutes: DURATION_MINUTES,
        lineItems: fixture.lineItems.map((row, index) =>
          index === 0 ? { ...row, unitPriceCents: row.unitPriceCents + 25 } : row,
        ),
        editReason: "Attempt unauthorized unit price override",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const edited = await updateWpStaffQuoteDraft(tenant.ctx, db, created.inquiryId, {
      guestCount: Math.max(10, beforePayload.guestCount),
      eventDate: EVENT_DATE,
      startTime: START_TIME,
      durationMinutes: DURATION_MINUTES,
      lineItems: fixture.lineItems,
      editReason: "Lock WP salad 2499 and lower_extra 7500 for financial lifecycle proof",
    });
    expect(edited.estimatedTotalCents).toBe(fixture.totalCents);
    expect(edited.provenance?.staffEdit?.wordpressParityExact).toBe(false);
    expect(edited.provenance?.originalTotalCents).toBeTruthy();

    const approved = await approveAndSendWpStaffQuote(sales.ctx, db, created.inquiryId, {
      approvalNote: "Sales approval for financial lifecycle",
    });
    expect(approved.approved).toBe(true);
    expect(approved.delivered).toBe(true);
    expect(approved.estimatedTotalCents).toBe(fixture.totalCents);

    const published = await db.eventPlanRecommendation.findFirstOrThrow({
      where: {
        inquiryId: created.inquiryId,
        kind: EVENT_PLAN_KINDS.RECOMMENDATION,
      },
    });
    expect(readEmployeeApprovedQuoteMarker(published.payload)).toBeTruthy();
    expect(JSON.stringify(published.payload)).not.toContain("catalogPriceDiscrepancies");
    const publishedPayload = readEventPlanPayload(published.payload);
    const saladLine = publishedPayload.lineItems?.find((row) => row.slug === "salad-pan");
    const extraLine = publishedPayload.lineItems?.find((row) =>
      row.slug.includes("extra") || /additional hour/i.test(row.name),
    );
    expect(saladLine?.unitPriceCents).toBe(SALAD_UNIT_CENTS);
    expect(extraLine?.unitPriceCents).toBe(LOWER_EXTRA_CENTS);
    expect(saladLine?.unitPriceCents).not.toBe(CATALOG_SALAD_CENTS);
    expect(extraLine?.unitPriceCents).not.toBe(CATALOG_LOWER_EXTRA_CENTS);

    const quoteComms = await db.communicationEvent.count({
      where: {
        organizationId: tenant.organizationId,
        inquiryId: created.inquiryId,
        kind: COMMUNICATION_KINDS.EMPLOYEE_APPROVED_QUOTE,
      },
    });
    expect(quoteComms).toBeGreaterThanOrEqual(1);

    const amountCheck = assertApprovedQuoteAmountsConsistent({
      estimatedTotalCents: published.estimatedTotalCents,
      payload: publishedPayload,
      onlyForEmployeeApprovedQuote: true,
    });
    expect(amountCheck.ok).toBe(true);
    if (!amountCheck.ok) {
      throw new Error(amountCheck.error);
    }

    const pending = await upsertPendingBookingFromPlan(db, {
      organizationId: tenant.organizationId,
      inquiryId: created.inquiryId,
      planId: published.id,
      actorUserProfileId: tenant.userProfileId,
      source: "customer_book_now",
    });
    expect(pending.booking.status).toBe(BOOKING_STATUSES.PENDING_PAYMENT);
    expect(pending.booking.totalCents).toBe(fixture.totalCents);
    const expectedDeposit = depositRequiredCents(
      fixture.totalCents,
      depositPercentFromTenant(DEPOSIT_PERCENT),
    );
    expect(pending.booking.depositRequiredCents).toBe(expectedDeposit);
    expect(pending.booking.depositPaidCents).toBe(0);
    // MagiCRM deposit policy = tenant depositPercent of approved total (not a WP calculator field).
    expect(expectedDeposit).toBe(Math.round((fixture.totalCents * DEPOSIT_PERCENT) / 100));

    const pendingLines = await db.bookingLineItem.findMany({
      where: { bookingId: pending.booking.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(pendingLines.find((row) => row.name === "Salad pan")?.unitPriceCents).toBe(SALAD_UNIT_CENTS);
    expect(
      pendingLines.find((row) => /additional hour/i.test(row.name))?.unitPriceCents,
    ).toBe(LOWER_EXTRA_CENTS);
    expect(pendingLines.find((row) => row.name === "Salad pan")?.unitPriceCents).not.toBe(
      CATALOG_SALAD_CENTS,
    );
    expect(
      pendingLines.find((row) => /additional hour/i.test(row.name))?.unitPriceCents,
    ).not.toBe(CATALOG_LOWER_EXTRA_CENTS);
    expect(pendingLines.reduce((sum, row) => sum + row.totalCents, 0)).toBe(fixture.totalCents);
    expect(
      await db.resourceReservation.count({
        where: {
          organizationId: tenant.organizationId,
          status: RESOURCE_RESERVATION_STATUSES.HOLD,
        },
      }),
    ).toBe(0);

    const againPending = await upsertPendingBookingFromPlan(db, {
      organizationId: tenant.organizationId,
      inquiryId: created.inquiryId,
      planId: published.id,
      actorUserProfileId: tenant.userProfileId,
      source: "customer_book_now",
    });
    expect(againPending.booking.id).toBe(pending.booking.id);
    expect(
      await db.booking.count({ where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId } }),
    ).toBe(1);

    // Simulated partial payment ledger (Phase 3C processor not live) — test double via depositPaidCents.
    const partialPaid = Math.floor(expectedDeposit / 2);
    await db.booking.update({
      where: { id: pending.booking.id },
      data: { depositPaidCents: partialPaid },
    });
    const afterPartial = await db.booking.findFirstOrThrow({ where: { id: pending.booking.id } });
    const remainingBalance = afterPartial.totalCents - afterPartial.depositPaidCents;
    expect(remainingBalance).toBe(fixture.totalCents - partialPaid);
    expect(afterPartial.depositPaidCents).toBe(partialPaid);

    const hoursException = await authorizeUnconfiguredHoursForConfirm({
      ctx: tenant.ctx,
      database: db,
      organizationId: tenant.organizationId,
      locationId: tenant.locationId!,
      inquiryId: created.inquiryId,
      slotDate: EVENT_DATE,
      startTime: START_TIME,
      durationMinutes: DURATION_MINUTES,
    });

    const confirmed = await confirmPendingBooking(db, {
      organizationId: tenant.organizationId,
      inquiryId: created.inquiryId,
      actorUserProfileId: tenant.userProfileId,
      attestExternalPayment: true,
      hoursExceptionId: hoursException.id,
    });
    expect(confirmed.booking.status).toBe(BOOKING_STATUSES.CONFIRMED);
    expect(confirmed.booking.depositRequiredCents).toBe(expectedDeposit);
    expect(confirmed.booking.paymentConfirmedExternallyAt).toBeTruthy();
    const confirmedBooking = await db.booking.findFirstOrThrow({
      where: { id: confirmed.booking.id },
      select: { totalCents: true, depositRequiredCents: true, depositPaidCents: true },
    });
    expect(confirmedBooking.totalCents).toBe(fixture.totalCents);
    expect(confirmedBooking.depositRequiredCents).toBe(expectedDeposit);
    expect(confirmedBooking.totalCents - confirmedBooking.depositPaidCents).toBe(
      fixture.totalCents - partialPaid,
    );

    const confirmedLines = await db.bookingLineItem.findMany({
      where: { bookingId: confirmed.booking.id },
    });
    expect(confirmedLines.find((row) => row.name === "Salad pan")?.unitPriceCents).toBe(SALAD_UNIT_CENTS);
    expect(
      confirmedLines.find((row) => /additional hour/i.test(row.name))?.unitPriceCents,
    ).toBe(LOWER_EXTRA_CENTS);
    expect(confirmedLines.reduce((sum, row) => sum + row.totalCents, 0)).toBe(fixture.totalCents);

    const bookedInquiry = await db.inquiry.findFirstOrThrow({ where: { id: created.inquiryId } });
    expect(bookedInquiry.status).toBe(INQUIRY_STATUSES.BOOKED);

    const idempotentConfirm = await confirmPendingBooking(db, {
      organizationId: tenant.organizationId,
      inquiryId: created.inquiryId,
      actorUserProfileId: tenant.userProfileId,
      attestExternalPayment: true,
    });
    expect(idempotentConfirm.booking.id).toBe(confirmed.booking.id);
    expect(idempotentConfirm.created).toBe(false);
    expect(
      await db.booking.count({ where: { organizationId: tenant.organizationId, inquiryId: created.inquiryId } }),
    ).toBe(1);

    const paymentAttests = await db.auditLog.count({
      where: {
        organizationId: tenant.organizationId,
        resourceId: confirmed.booking.id,
        action: "booking.payment_attested",
      },
    });
    expect(paymentAttests).toBe(1);

    // Tenant isolation: another org cannot see this booking's lines by inquiry id alone.
    const other = await provisionTenant("iso");
    expect(
      await db.booking.findFirst({
        where: { organizationId: other.organizationId, inquiryId: created.inquiryId },
      }),
    ).toBeNull();
  }, 180_000);

  it("keeps Event Sales able to approve while Administrators alone override unit prices", async () => {
    const tenant = await provisionTenant("perms");
    await importBookingCatalog(db, {
      organizationSlug: tenant.organization.slug,
      dataset: loadBookingCatalogDataset(),
    });
    const created = await createPublicWpEventInquiry(
      db,
      {
        organizationSlug: tenant.organization.slug,
        rateLimitKey: `${tenant.organization.slug}:perm`,
        firstName: "Perm",
        lastName: "Check",
        company: "Perm Co",
        phone: "5745550188",
        email: `perm.${crypto.randomUUID()}@example.test`,
        eventType: "Birthday",
        dates: [EVENT_DATE],
        time: START_TIME,
        adults: 8,
        children: 0,
        duration: "2 hours",
        attractions: {
          bowling: "yes",
          axe: "no",
          laser: "no",
          golf: "no",
          climbing: "no",
          arcade: "no",
        },
        food: "no",
        privateRoom: "no",
        craft: "no",
        hasBudget: "no",
        description: "Permission check",
        comments: null,
        referral: "QA",
        submissionId: `sub_perm_${crypto.randomUUID()}`,
      },
      unlimitedLimiter,
    );
    await setPrivatePricingSource(created.inquiryId, "approved_plugin_baseline");
    const draft = await createWpStaffQuoteDraftFromInquiry(tenant.ctx, db, created.inquiryId);
    const working = await db.eventPlanRecommendation.findFirstOrThrow({ where: { id: draft.planId } });
    const payload = readEventPlanPayload(working.payload);
    const sales = await addGroupUser(tenant, SYSTEM_GROUP_KEYS.EVENT_SALES, "sales2");

    await expect(
      updateWpStaffQuoteDraft(sales.ctx, db, created.inquiryId, {
        guestCount: payload.guestCount,
        eventDate: payload.eventDate,
        startTime: payload.startTime,
        durationMinutes: working.durationMinutes ?? 120,
        lineItems: (payload.lineItems ?? []).map((row, index) =>
          index === 0
            ? {
                slug: row.slug,
                name: row.name,
                quantity: row.quantity,
                unitPriceCents: row.unitPriceCents + 100,
                kind: row.kind,
              }
            : {
                slug: row.slug,
                name: row.name,
                quantity: row.quantity,
                unitPriceCents: row.unitPriceCents,
                kind: row.kind,
              },
        ),
        editReason: "Sales cannot override unit price",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const qtyOnly = await updateWpStaffQuoteDraft(sales.ctx, db, created.inquiryId, {
      guestCount: payload.guestCount,
      eventDate: payload.eventDate,
      startTime: payload.startTime,
      durationMinutes: working.durationMinutes ?? 120,
      lineItems: (payload.lineItems ?? []).map((row, index) =>
        index === 0
          ? {
              slug: row.slug,
              name: row.name,
              quantity: row.quantity + 1,
              unitPriceCents: row.unitPriceCents,
              kind: row.kind,
            }
          : {
              slug: row.slug,
              name: row.name,
              quantity: row.quantity,
              unitPriceCents: row.unitPriceCents,
              kind: row.kind,
            },
      ),
      editReason: "Sales quantity-only edit is allowed",
    });
    expect(qtyOnly.estimatedTotalCents).toBeGreaterThan(working.estimatedTotalCents ?? 0);

    const afterQty = await db.eventPlanRecommendation.findFirstOrThrow({
      where: { inquiryId: created.inquiryId, kind: EVENT_PLAN_KINDS.AGENT_WORKING },
    });
    const afterQtyPayload = readEventPlanPayload(afterQty.payload);
    const adminEdit = await updateWpStaffQuoteDraft(tenant.ctx, db, created.inquiryId, {
      guestCount: afterQtyPayload.guestCount,
      eventDate: afterQtyPayload.eventDate,
      startTime: afterQtyPayload.startTime,
      durationMinutes: afterQty.durationMinutes ?? 120,
      lineItems: (afterQtyPayload.lineItems ?? []).map((row, index) =>
        index === 0
          ? {
              slug: row.slug,
              name: row.name,
              quantity: row.quantity,
              unitPriceCents: row.unitPriceCents + 50,
              kind: row.kind,
            }
          : {
              slug: row.slug,
              name: row.name,
              quantity: row.quantity,
              unitPriceCents: row.unitPriceCents,
              kind: row.kind,
            },
      ),
      editReason: "Administrator unit price override",
    });
    expect(adminEdit.estimatedTotalCents).toBeGreaterThan(qtyOnly.estimatedTotalCents ?? 0);

    const approved = await approveAndSendWpStaffQuote(sales.ctx, db, created.inquiryId, {
      approvalNote: "Baseline internal approval",
    });
    expect(approved.approved).toBe(true);
    expect(approved.delivered).toBe(false);
  }, 120_000);
});
