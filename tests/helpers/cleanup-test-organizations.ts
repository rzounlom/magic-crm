import type { PrismaClient } from "@/generated/prisma/client";

export async function deleteTestOrganizations(
  database: PrismaClient,
  organizationIds: readonly string[],
): Promise<void> {
  if (organizationIds.length === 0) {
    return;
  }

  const ids = [...organizationIds];
  await database.communicationEvent.deleteMany({ where: { organizationId: { in: ids } } });
  await database.resourceReservation.deleteMany({ where: { organizationId: { in: ids } } });
  await database.knowledgeResourceRequirement.deleteMany({ where: { organizationId: { in: ids } } });
  await database.resource.deleteMany({ where: { organizationId: { in: ids } } });
  await database.resourceType.deleteMany({ where: { organizationId: { in: ids } } });
  await database.conversationMessage.deleteMany({ where: { organizationId: { in: ids } } });
  await database.aiUsage.deleteMany({ where: { organizationId: { in: ids } } });
  await database.eventPlanRecommendation.deleteMany({ where: { organizationId: { in: ids } } });
  await database.conversation.deleteMany({ where: { organizationId: { in: ids } } });
  await database.inquiry.deleteMany({ where: { organizationId: { in: ids } } });
  await database.salesKnowledgeItem.deleteMany({ where: { organizationId: { in: ids } } });
  await database.teamInvitation.deleteMany({ where: { organizationId: { in: ids } } });
  await database.auditLog.deleteMany({ where: { organizationId: { in: ids } } });
  await database.securityGroup.deleteMany({ where: { organizationId: { in: ids } } });
  await database.userProfile.deleteMany({ where: { organizationId: { in: ids } } });
  await database.location.deleteMany({ where: { organizationId: { in: ids } } });
  await database.organization.deleteMany({ where: { id: { in: ids } } });
}
