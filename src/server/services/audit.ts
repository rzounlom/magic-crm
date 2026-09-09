import type { PrismaClient } from "@/generated/prisma/client";
import type { RequestContext } from "@/server/request-context";

export type AuditAction =
  | "security_group.created"
  | "security_group.updated"
  | "security_group.deleted"
  | "security_group.permissions_changed"
  | "security_group.member_added"
  | "security_group.member_removed"
  | "security_group.administrator_bootstrapped"
  | "employee.invited"
  | "employee.invitation_revoked"
  | "employee.invitation_accepted"
  | "employee.invitation_reconciled"
  | "employee.invitation_replaced"
  | "employee.group_assigned"
  | "tenant.client_created"
  | "tenant.admin_invited"
  | "inquiry.created"
  | "inquiry.plan_generated"
  | "inquiry.plan_viewed"
  | "inquiry.plan_selected"
  | "communication.plan_selection_skipped"
  | "communication.booking_confirmation_skipped"
  | "ai.conversation_started"
  | "ai.message_generated"
  | "ai.handoff_requested"
  | "ai.paused"
  | "ai.resumed"
  | "employee.conversation_taken_over"
  | "sales_knowledge.created"
  | "sales_knowledge.updated"
  | "resource_type.created"
  | "resource_type.updated"
  | "resource.created"
  | "resource.updated"
  | "resource.deactivated"
  | "resource.hold_created"
  | "resource.hold_released"
  | "resource.hold_expired"
  | "resource.hold_conflict_rejected"
  | "knowledge_requirement.updated";

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
