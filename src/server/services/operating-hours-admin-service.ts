import type { PrismaClient } from "@/generated/prisma/client";

import { ResourceError } from "@/server/errors";
import { requirePermission } from "@/server/policies/require-permission";
import type { RequestContext } from "@/server/request-context";
import {
  validateDateException,
  validateWeeklyWindows,
  type DateExceptionInput,
  type WeeklyWindowInput,
} from "@/lib/operating-hours/admin-validation";
import { recordAuditEvent } from "@/server/services/audit";
import {
  OPERATING_HOURS_EXCEPTION_KINDS,
  OPERATING_HOURS_VERIFICATION_STATUSES,
} from "@/types/operating-hours";
import { PERMISSIONS } from "@/types/permissions";

type HoursDb = PrismaClient;

async function requireLocationsManage(ctx: RequestContext, database: HoursDb) {
  await requirePermission(ctx, PERMISSIONS.LOCATIONS_MANAGE, database);
}

async function loadLocationOrThrow(ctx: RequestContext, database: HoursDb, locationId: string) {
  const location = await database.location.findFirst({
    where: { id: locationId, organizationId: ctx.organizationId },
    select: { id: true, name: true, slug: true, timezone: true, active: true },
  });
  if (!location) {
    throw new ResourceError("RESOURCE_NOT_FOUND", "That location could not be found for this organization.");
  }
  return location;
}

function civilDateUtc(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

export async function listLocationsOperatingHoursForAdmin(ctx: RequestContext, database: HoursDb) {
  await requireLocationsManage(ctx, database);
  const locations = await database.location.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      active: true,
      operatingHoursPolicy: {
        select: {
          id: true,
          verificationStatus: true,
          approvedAt: true,
          approvedByNote: true,
          updatedAt: true,
          _count: { select: { weeklyWindows: true, exceptions: true } },
        },
      },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return locations;
}

export async function getLocationOperatingHoursForAdmin(
  ctx: RequestContext,
  database: HoursDb,
  locationId: string,
) {
  await requireLocationsManage(ctx, database);
  const location = await loadLocationOrThrow(ctx, database, locationId);
  const policy = await database.locationOperatingHoursPolicy.findFirst({
    where: { organizationId: ctx.organizationId, locationId },
    include: {
      weeklyWindows: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
      exceptions: { orderBy: [{ localDate: "asc" }, { kind: "asc" }] },
    },
  });

  const lastAuditRow = policy
    ? await database.auditLog.findFirst({
        where: {
          organizationId: ctx.organizationId,
          resourceType: "location_operating_hours_policy",
          resourceId: policy.id,
        },
        orderBy: { createdAt: "desc" },
        select: {
          action: true,
          createdAt: true,
          actorUserProfileId: true,
        },
      })
    : null;
  const lastActor = lastAuditRow?.actorUserProfileId
    ? await database.userProfile.findFirst({
        where: { id: lastAuditRow.actorUserProfileId, organizationId: ctx.organizationId },
        select: { id: true, email: true, displayName: true },
      })
    : null;

  return {
    location,
    policy,
    lastAudit: lastAuditRow
      ? {
          action: lastAuditRow.action,
          createdAt: lastAuditRow.createdAt,
          actor: lastActor,
        }
      : null,
  };
}

async function ensurePolicy(
  ctx: RequestContext,
  database: HoursDb,
  locationId: string,
): Promise<{ id: string; verificationStatus: string }> {
  const existing = await database.locationOperatingHoursPolicy.findFirst({
    where: { organizationId: ctx.organizationId, locationId },
    select: { id: true, verificationStatus: true },
  });
  if (existing) {
    return existing;
  }
  return database.locationOperatingHoursPolicy.create({
    data: {
      organizationId: ctx.organizationId,
      locationId,
      verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT,
    },
    select: { id: true, verificationStatus: true },
  });
}

async function demoteIfVerified(
  database: Pick<HoursDb, "locationOperatingHoursPolicy" | "auditLog">,
  organizationId: string,
  policyId: string,
  verificationStatus: string,
) {
  if (verificationStatus !== OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED) {
    return;
  }
  await database.locationOperatingHoursPolicy.update({
    where: { id: policyId },
    data: {
      verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT,
      approvedAt: null,
      approvedByNote: null,
    },
  });
  await recordAuditEvent(database, {
    organizationId,
    action: "scheduling.hours_policy_demoted",
    resourceType: "location_operating_hours_policy",
    resourceId: policyId,
    metadata: { reason: "policy_edited_after_verify" },
  });
}

export async function saveWeeklyOperatingHoursDraft(
  ctx: RequestContext,
  database: HoursDb,
  input: { locationId: string; windows: WeeklyWindowInput[] },
) {
  await requireLocationsManage(ctx, database);
  await loadLocationOrThrow(ctx, database, input.locationId);
  const validationError = validateWeeklyWindows(input.windows);
  if (validationError) {
    throw new ResourceError("INVALID_RESOURCE", validationError);
  }

  const policy = await ensurePolicy(ctx, database, input.locationId);
  await database.$transaction(async (tx) => {
    await demoteIfVerified(tx, ctx.organizationId, policy.id, policy.verificationStatus);
    await tx.locationOperatingHoursWindow.deleteMany({
      where: { organizationId: ctx.organizationId, policyId: policy.id },
    });
    if (input.windows.length > 0) {
      await tx.locationOperatingHoursWindow.createMany({
        data: input.windows.map((row) => ({
          organizationId: ctx.organizationId,
          locationId: input.locationId,
          policyId: policy.id,
          dayOfWeek: row.dayOfWeek,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
        })),
      });
    }
    await tx.locationOperatingHoursPolicy.update({
      where: { id: policy.id },
      data: {
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT,
        approvedAt: null,
        approvedByNote: null,
      },
    });
  });

  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "scheduling.hours_policy_draft_saved",
    resourceType: "location_operating_hours_policy",
    resourceId: policy.id,
    metadata: {
      locationId: input.locationId,
      windowCount: input.windows.length,
    },
  });

  return { policyId: policy.id };
}

export async function upsertOperatingHoursDateException(
  ctx: RequestContext,
  database: HoursDb,
  input: { locationId: string; exception: DateExceptionInput },
) {
  await requireLocationsManage(ctx, database);
  await loadLocationOrThrow(ctx, database, input.locationId);
  const validationError = validateDateException(input.exception);
  if (validationError) {
    throw new ResourceError("INVALID_RESOURCE", validationError);
  }

  const policy = await ensurePolicy(ctx, database, input.locationId);
  const localDate = civilDateUtc(input.exception.localDate);

  await database.$transaction(async (tx) => {
    await demoteIfVerified(tx, ctx.organizationId, policy.id, policy.verificationStatus);
    await tx.locationOperatingHoursException.deleteMany({
      where: {
        organizationId: ctx.organizationId,
        policyId: policy.id,
        localDate,
      },
    });
    await tx.locationOperatingHoursException.create({
      data: {
        organizationId: ctx.organizationId,
        locationId: input.locationId,
        policyId: policy.id,
        localDate,
        kind: input.exception.kind,
        startMinute:
          input.exception.kind === OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM
            ? input.exception.startMinute!
            : null,
        endMinute:
          input.exception.kind === OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM
            ? input.exception.endMinute!
            : null,
        note: input.exception.note?.trim() || null,
      },
    });
    await tx.locationOperatingHoursPolicy.update({
      where: { id: policy.id },
      data: {
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT,
        approvedAt: null,
        approvedByNote: null,
      },
    });
  });

  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "scheduling.hours_exception_date_saved",
    resourceType: "location_operating_hours_policy",
    resourceId: policy.id,
    metadata: {
      locationId: input.locationId,
      localDate: input.exception.localDate,
      kind: input.exception.kind,
    },
  });

  return { policyId: policy.id };
}

export async function deleteOperatingHoursDateException(
  ctx: RequestContext,
  database: HoursDb,
  input: { locationId: string; exceptionId: string },
) {
  await requireLocationsManage(ctx, database);
  await loadLocationOrThrow(ctx, database, input.locationId);
  const exception = await database.locationOperatingHoursException.findFirst({
    where: {
      id: input.exceptionId,
      organizationId: ctx.organizationId,
      locationId: input.locationId,
    },
    select: { id: true, policyId: true, localDate: true },
  });
  if (!exception) {
    throw new ResourceError("RESOURCE_NOT_FOUND", "That hours exception could not be found.");
  }

  const policy = await database.locationOperatingHoursPolicy.findFirst({
    where: { id: exception.policyId, organizationId: ctx.organizationId },
    select: { id: true, verificationStatus: true },
  });
  if (!policy) {
    throw new ResourceError("RESOURCE_NOT_FOUND", "That hours policy could not be found.");
  }

  await database.$transaction(async (tx) => {
    await demoteIfVerified(tx, ctx.organizationId, policy.id, policy.verificationStatus);
    await tx.locationOperatingHoursException.delete({ where: { id: exception.id } });
    await tx.locationOperatingHoursPolicy.update({
      where: { id: policy.id },
      data: {
        verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT,
        approvedAt: null,
        approvedByNote: null,
      },
    });
  });

  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "scheduling.hours_exception_date_deleted",
    resourceType: "location_operating_hours_policy",
    resourceId: policy.id,
    metadata: {
      locationId: input.locationId,
      exceptionId: exception.id,
      localDate: exception.localDate.toISOString().slice(0, 10),
    },
  });
}

export async function verifyOperatingHoursPolicy(
  ctx: RequestContext,
  database: HoursDb,
  input: { locationId: string; approvedByNote: string },
) {
  await requireLocationsManage(ctx, database);
  await loadLocationOrThrow(ctx, database, input.locationId);
  const note = input.approvedByNote.trim();
  if (note.length < 8 || note.length > 500) {
    throw new ResourceError(
      "INVALID_RESOURCE",
      "Enter an approval note between 8 and 500 characters before verifying hours.",
    );
  }

  const policy = await database.locationOperatingHoursPolicy.findFirst({
    where: { organizationId: ctx.organizationId, locationId: input.locationId },
    select: { id: true },
  });
  if (!policy) {
    throw new ResourceError(
      "INVALID_RESOURCE",
      "Save a draft weekly schedule before marking hours verified.",
    );
  }
  const updated = await database.locationOperatingHoursPolicy.update({
    where: { id: policy.id },
    data: {
      verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
      approvedAt: new Date(),
      approvedByNote: note,
    },
  });

  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "scheduling.hours_policy_verified",
    resourceType: "location_operating_hours_policy",
    resourceId: policy.id,
    metadata: {
      locationId: input.locationId,
      approvedByNote: note.slice(0, 200),
    },
  });

  return updated;
}

export async function revertOperatingHoursPolicyToDraft(
  ctx: RequestContext,
  database: HoursDb,
  input: { locationId: string },
) {
  await requireLocationsManage(ctx, database);
  await loadLocationOrThrow(ctx, database, input.locationId);
  const policy = await database.locationOperatingHoursPolicy.findFirst({
    where: { organizationId: ctx.organizationId, locationId: input.locationId },
    select: { id: true, verificationStatus: true },
  });
  if (!policy) {
    throw new ResourceError("RESOURCE_NOT_FOUND", "That hours policy could not be found.");
  }
  if (policy.verificationStatus === OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT) {
    return policy;
  }

  const updated = await database.locationOperatingHoursPolicy.update({
    where: { id: policy.id },
    data: {
      verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.DRAFT,
      approvedAt: null,
      approvedByNote: null,
    },
  });

  await recordAuditEvent(database, {
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
    action: "scheduling.hours_policy_demoted",
    resourceType: "location_operating_hours_policy",
    resourceId: policy.id,
    metadata: { locationId: input.locationId, reason: "manual_revert_to_draft" },
  });

  return updated;
}
