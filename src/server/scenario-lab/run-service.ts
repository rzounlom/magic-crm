import "server-only";

import { randomBytes } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { resolvePrimaryLocationId } from "@/server/locations/primary-location";
import {
  SCENARIO_LAB_ENTITY_TYPES,
  SCENARIO_LAB_RUN_STATUSES,
  SCENARIO_LAB_TEMPLATE_KEYS,
  SCENARIO_LAB_TEMPLATES,
  SCENARIO_LAB_TIMELINE_KINDS,
  formatScenarioLabStatus,
  scenarioLabTemplateByKey,
  type ScenarioLabTimelineEntry,
} from "@/server/scenario-lab/constants";
import { ScenarioLabError } from "@/server/scenario-lab/errors";
import {
  generateScenarioLabInquiryFixture,
  type ScenarioLabInquiryFixture,
} from "@/server/scenario-lab/synthetic-customer";
import { appendTimeline, createTimelineEntry, parseTimeline } from "@/server/scenario-lab/timeline";
import { listPublicPlannerCatalog } from "@/server/services/event-plan-service";
import type { RequestContext } from "@/server/request-context";

type RunDb = PrismaClient;

export type VenueReadiness = {
  ready: boolean;
  organizationSlug: string | null;
  locationId: string | null;
  locationName: string | null;
  attractionInterestIds: string[];
  requirements: string[];
};

export async function assessTrustedVenueReadiness(
  database: RunDb,
  organizationId: string,
): Promise<VenueReadiness> {
  const organization = await database.organization.findFirst({
    where: { id: organizationId },
    select: { id: true, slug: true, onboardingStatus: true, name: true },
  });
  const requirements: string[] = [];
  if (!organization || organization.onboardingStatus !== "ACTIVE") {
    requirements.push("Trusted organization must be ACTIVE.");
    return {
      ready: false,
      organizationSlug: organization?.slug ?? null,
      locationId: null,
      locationName: null,
      attractionInterestIds: [],
      requirements,
    };
  }

  const locationId = await resolvePrimaryLocationId(database, organizationId);
  const location = locationId
    ? await database.location.findFirst({
        where: { id: locationId, organizationId, active: true },
        select: { id: true, name: true },
      })
    : null;
  if (!location) {
    requirements.push("Configure at least one active location for the trusted TEST organization.");
  }

  let attractionInterestIds: string[] = [];
  try {
    const catalog = await listPublicPlannerCatalog(database, organization.slug);
    attractionInterestIds = catalog.attractions.map((item) => item.id);
    if (attractionInterestIds.length === 0) {
      requirements.push(
        "Publish at least one public attraction interest so the inquiry form can offer activities.",
      );
    }
  } catch {
    requirements.push("Public planner catalog is not available for this organization.");
  }

  return {
    ready: requirements.length === 0 && Boolean(location),
    organizationSlug: organization.slug,
    locationId: location?.id ?? null,
    locationName: location?.name ?? null,
    attractionInterestIds,
    requirements,
  };
}

function newCorrelationToken(): string {
  return randomBytes(24).toString("hex");
}

function fixtureFromJson(value: unknown): ScenarioLabInquiryFixture | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as ScenarioLabInquiryFixture;
}

export async function createCustomerInquiryScenarioRun(
  ctx: RequestContext,
  database: RunDb,
  input: {
    idempotencyKey: string;
    eventDate?: string;
    guestCount?: number;
    eventType?: string;
  },
): Promise<{ runId: string; reused: boolean }> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 80) {
    throw new ScenarioLabError("INVALID_INPUT", "idempotencyKey must be 8–80 characters");
  }

  const existing = await database.scenarioLabRun.findUnique({
    where: {
      organizationId_idempotencyKey: {
        organizationId: ctx.organizationId,
        idempotencyKey,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return { runId: existing.id, reused: true };
  }

  const template = scenarioLabTemplateByKey(SCENARIO_LAB_TEMPLATE_KEYS.CUSTOMER_SUBMITS_INQUIRY);
  if (!template?.available) {
    throw new ScenarioLabError("TEMPLATE_UNAVAILABLE");
  }

  const venue = await assessTrustedVenueReadiness(database, ctx.organizationId);
  if (!venue.ready || !venue.locationId || !venue.locationName) {
    throw new ScenarioLabError(
      "VENUE_NOT_READY",
      venue.requirements.join(" ") || "TEST venue is not ready for inquiry staging.",
    );
  }

  const fixture = generateScenarioLabInquiryFixture({
    locationId: venue.locationId,
    locationName: venue.locationName,
    attractionInterestIds: venue.attractionInterestIds,
    eventDate: input.eventDate,
  });
  if (input.guestCount && input.guestCount >= 1 && input.guestCount <= 500) {
    fixture.guestCount = input.guestCount;
  }
  if (input.eventType?.trim()) {
    fixture.eventType = input.eventType.trim();
  }

  const createdEntry = createTimelineEntry({
    kind: SCENARIO_LAB_TIMELINE_KINDS.OPERATOR_ACTION,
    code: "run_created",
    message: "Scenario run created with synthetic customer fixture.",
  });
  const readyEntry = createTimelineEntry({
    kind: SCENARIO_LAB_TIMELINE_KINDS.OBSERVED_STATE,
    code: "run_ready",
    message: "Run is ready for public inquiry submission.",
  });
  const futureEntry = createTimelineEntry({
    kind: SCENARIO_LAB_TIMELINE_KINDS.EXPECTED_FUTURE,
    code: "awaiting_inquiry_submission",
    message: "Awaiting inquiry submission through the public intake form.",
  });

  try {
    const run = await database.scenarioLabRun.create({
      data: {
        organizationId: ctx.organizationId,
        createdByUserProfileId: ctx.userId,
        templateKey: template.key,
        status: SCENARIO_LAB_RUN_STATUSES.READY,
        correlationToken: newCorrelationToken(),
        idempotencyKey,
        fixturePayload: fixture as unknown as Prisma.InputJsonValue,
        timeline: [createdEntry, readyEntry, futureEntry] as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { runId: run.id, reused: false };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const raced = await database.scenarioLabRun.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: ctx.organizationId,
            idempotencyKey,
          },
        },
        select: { id: true },
      });
      if (raced) {
        return { runId: raced.id, reused: true };
      }
    }
    throw error;
  }
}

export async function markScenarioLabPublicIntakeOpened(
  ctx: RequestContext,
  database: RunDb,
  runId: string,
): Promise<{ publicIntakePath: string }> {
  const venue = await assessTrustedVenueReadiness(database, ctx.organizationId);
  if (!venue.organizationSlug) {
    throw new ScenarioLabError("VENUE_NOT_READY", "Organization slug is unavailable.");
  }

  const result = await database.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id
      FROM scenario_lab_runs
      WHERE id = ${runId}
        AND "organizationId" = ${ctx.organizationId}
      FOR UPDATE
    `;
    const run = await tx.scenarioLabRun.findFirst({
      where: { id: runId, organizationId: ctx.organizationId },
      select: { id: true, status: true, correlationToken: true, timeline: true },
    });
    if (!run) {
      throw new ScenarioLabError("RUN_NOT_FOUND");
    }
    if (
      run.status !== SCENARIO_LAB_RUN_STATUSES.READY &&
      run.status !== SCENARIO_LAB_RUN_STATUSES.RUNNING
    ) {
      throw new ScenarioLabError(
        "INVALID_RUN_STATUS",
        `Cannot open public intake while run is ${formatScenarioLabStatus(run.status)}.`,
      );
    }

    const timeline = appendTimeline(
      run.timeline,
      createTimelineEntry({
        kind: SCENARIO_LAB_TIMELINE_KINDS.OPERATOR_ACTION,
        code: "public_intake_opened",
        message: "Operator opened the real public MagicCRM inquiry form.",
      }),
    );

    await tx.scenarioLabRun.update({
      where: { id: run.id },
      data: {
        status: SCENARIO_LAB_RUN_STATUSES.RUNNING,
        publicIntakeOpenedAt: new Date(),
        timeline: timeline as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      publicIntakePath: `/inquire/${venue.organizationSlug}?lab=${encodeURIComponent(run.correlationToken)}`,
    };
  });

  return result;
}

export type ScenarioLabRunListItem = {
  id: string;
  templateKey: string;
  templateName: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
};

export async function listScenarioLabRuns(
  ctx: RequestContext,
  database: RunDb,
  limit = 20,
): Promise<ScenarioLabRunListItem[]> {
  const rows = await database.scenarioLabRun.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: {
      id: true,
      templateKey: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    templateKey: row.templateKey,
    templateName: scenarioLabTemplateByKey(row.templateKey)?.name ?? row.templateKey,
    status: row.status,
    statusLabel: formatScenarioLabStatus(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export type ScenarioLabRunDetail = {
  id: string;
  templateKey: string;
  templateName: string;
  status: string;
  statusLabel: string;
  operatorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  publicIntakeOpenedAt: string | null;
  inquiryLinkedAt: string | null;
  failureMessage: string | null;
  fixture: ScenarioLabInquiryFixture | null;
  inquiry: {
    id: string;
    status: string;
    staffPath: string;
    customerName: string;
    customerEmail: string;
  } | null;
  awaitingInquirySubmission: boolean;
  timeline: ScenarioLabTimelineEntry[];
  publicIntakePath: string | null;
};

export async function getScenarioLabRunDetail(
  ctx: RequestContext,
  database: RunDb,
  runId: string,
): Promise<ScenarioLabRunDetail> {
  const run = await database.scenarioLabRun.findFirst({
    where: { id: runId, organizationId: ctx.organizationId },
    include: {
      createdBy: {
        select: { displayName: true, firstName: true, lastName: true, clerkUserId: true },
      },
      ownedEntities: {
        where: { entityType: SCENARIO_LAB_ENTITY_TYPES.INQUIRY },
        select: { entityId: true },
        take: 1,
      },
    },
  });
  if (!run) {
    throw new ScenarioLabError("RUN_NOT_FOUND");
  }

  const operator =
    run.createdBy.displayName?.trim() ||
    [run.createdBy.firstName, run.createdBy.lastName].filter(Boolean).join(" ").trim() ||
    run.createdBy.clerkUserId;

  const inquiryId = run.ownedEntities[0]?.entityId ?? null;
  let inquiry: ScenarioLabRunDetail["inquiry"] = null;
  if (inquiryId) {
    const row = await database.inquiry.findFirst({
      where: { id: inquiryId, organizationId: ctx.organizationId },
      select: {
        id: true,
        status: true,
        customerFirstName: true,
        customerLastName: true,
        customerEmail: true,
      },
    });
    if (row) {
      inquiry = {
        id: row.id,
        status: row.status,
        staffPath: `/app/inquiries/${row.id}`,
        customerName: [row.customerFirstName, row.customerLastName].filter(Boolean).join(" ").trim() || "Customer",
        customerEmail: row.customerEmail,
      };
    }
  }

  const organization = await database.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { slug: true },
  });
  const canOpenIntake =
    run.status === SCENARIO_LAB_RUN_STATUSES.READY || run.status === SCENARIO_LAB_RUN_STATUSES.RUNNING;

  return {
    id: run.id,
    templateKey: run.templateKey,
    templateName: scenarioLabTemplateByKey(run.templateKey)?.name ?? run.templateKey,
    status: run.status,
    statusLabel: formatScenarioLabStatus(run.status),
    operatorDisplayName: operator,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    publicIntakeOpenedAt: run.publicIntakeOpenedAt?.toISOString() ?? null,
    inquiryLinkedAt: run.inquiryLinkedAt?.toISOString() ?? null,
    failureMessage: run.failureMessage,
    fixture: fixtureFromJson(run.fixturePayload),
    inquiry,
    awaitingInquirySubmission: !inquiry && run.status !== SCENARIO_LAB_RUN_STATUSES.FAILED,
    timeline: parseTimeline(run.timeline),
    publicIntakePath:
      canOpenIntake && organization?.slug
        ? `/inquire/${organization.slug}?lab=${encodeURIComponent(run.correlationToken)}`
        : null,
  };
}

/** Public-safe prefill lookup by correlation token for the matching organization slug. */
export async function loadPublicIntakePrefillForLabToken(
  database: RunDb,
  organizationSlug: string,
  correlationToken: string,
): Promise<{
  correlationToken: string;
  answers: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    customerGroupName: string;
    eventType: string;
    guestCount: string;
    guestMix: string;
    foodPreference: string;
    privateSpacePreference: string;
    budgetBand: string;
    desiredDurationMinutes: string;
    eventDate: string;
    startHour: string;
    startMinute: string;
    startPeriod: "AM" | "PM" | "";
    attractionInterestIds: string[];
    notes: string;
  }>;
} | null> {
  if (!isPlausibleToken(correlationToken)) {
    return null;
  }
  const organization = await database.organization.findFirst({
    where: { slug: organizationSlug.trim().toLowerCase(), onboardingStatus: "ACTIVE" },
    select: { id: true },
  });
  if (!organization) {
    return null;
  }

  const run = await database.scenarioLabRun.findFirst({
    where: {
      organizationId: organization.id,
      correlationToken: correlationToken.trim(),
      status: {
        in: [SCENARIO_LAB_RUN_STATUSES.READY, SCENARIO_LAB_RUN_STATUSES.RUNNING],
      },
    },
    select: { correlationToken: true, fixturePayload: true },
  });
  if (!run) {
    return null;
  }
  const fixture = fixtureFromJson(run.fixturePayload);
  if (!fixture) {
    return null;
  }

  return {
    correlationToken: run.correlationToken,
    answers: {
      firstName: fixture.firstName,
      lastName: fixture.lastName,
      email: fixture.email,
      phone: fixture.phone,
      customerGroupName: fixture.customerGroupName,
      eventType: fixture.eventType,
      guestCount: String(fixture.guestCount),
      guestMix: fixture.guestMix,
      foodPreference: fixture.foodPreference,
      privateSpacePreference: fixture.privateSpacePreference,
      budgetBand: fixture.budgetBand,
      desiredDurationMinutes: String(fixture.desiredDurationMinutes),
      eventDate: fixture.eventDate,
      startHour: fixture.startHour,
      startMinute: fixture.startMinute,
      startPeriod: fixture.startPeriod,
      attractionInterestIds: fixture.attractionInterestIds,
      notes: fixture.notes,
    },
  };
}

function isPlausibleToken(value: string): boolean {
  return /^[a-f0-9]{32,64}$/i.test(value.trim());
}

export function listScenarioLabTemplateViews() {
  return SCENARIO_LAB_TEMPLATES.map((template) => ({
    key: template.key,
    name: template.name,
    description: template.description,
    available: template.available,
    statusLabel: template.available ? "Available" : "Coming later",
  }));
}
