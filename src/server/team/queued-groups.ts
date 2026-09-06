import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";

export type AssignableSecurityGroup = {
  id: string;
  organizationId: string;
  systemKey: string | null;
};

export function uniqueGroupIds(groupIds: readonly string[]): string[] {
  return [...new Set(groupIds.filter((id) => id.trim().length > 0))];
}

export function queuedGroupsIncludeAdministrators(
  groups: readonly AssignableSecurityGroup[],
): boolean {
  return groups.some((group) => group.systemKey === SYSTEM_GROUP_KEYS.ADMINISTRATORS);
}

export function assertQueuedGroupsInTenant(
  groups: readonly AssignableSecurityGroup[],
  organizationId: string,
  requestedIds: readonly string[],
): void {
  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const id of uniqueGroupIds(requestedIds)) {
    const group = byId.get(id);
    if (!group || group.organizationId !== organizationId) {
      throw new Error("QUEUED_GROUP_NOT_IN_TENANT");
    }
  }
}

export function canSelectAdministratorsGroup(input: {
  inviterIsMagicCrmAdministrator: boolean;
}): boolean {
  return input.inviterIsMagicCrmAdministrator;
}

export function firstAdminQueuedGroupIds(input: {
  administratorsGroupId: string;
  extraGroupIds?: readonly string[];
}): string[] {
  return uniqueGroupIds([input.administratorsGroupId, ...(input.extraGroupIds ?? [])]);
}
