import type { PrismaClient } from "@/generated/prisma/client";
import type { RequestContext } from "@/server/request-context";

export type AuditAction =
  | "security_group.created"
  | "security_group.updated"
  | "security_group.deleted"
  | "security_group.permissions_changed"
  | "security_group.member_added"
  | "security_group.member_removed"
  | "security_group.administrator_bootstrapped";

type AuditMetadata = Record<string, string | number | boolean | null>;

export async function recordAuditEvent(
  database: Pick<PrismaClient, "auditLog">,
  input: {
    organizationId: string;
    actorUserProfileId?: string | null;
    action: AuditAction;
    resourceType: string;
    resourceId?: string | null;
    metadata?: AuditMetadata;
  },
): Promise<void> {
  await database.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserProfileId: input.actorUserProfileId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

export async function recordSecurityAudit(
  database: Pick<PrismaClient, "auditLog">,
  ctx: Pick<RequestContext, "organizationId" | "userId">,
  input: Omit<Parameters<typeof recordAuditEvent>[1], "organizationId" | "actorUserProfileId">,
): Promise<void> {
  await recordAuditEvent(database, {
    ...input,
    organizationId: ctx.organizationId,
    actorUserProfileId: ctx.userId,
  });
}
