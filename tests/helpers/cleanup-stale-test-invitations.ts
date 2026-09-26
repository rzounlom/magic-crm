import type { PrismaClient } from "@/generated/prisma/client";

const LEGACY_FIXTURE_INVITATION_ID = /^orginv_\d+$/;

/**
 * Removes leftover fake Clerk invitation ids from crashed integration runs.
 * Those ids were `orginv_1`, `orginv_2`, … and collide on team_invitations.clerkOrganizationInvitationId.
 * Only the isolated test database may call this. Sequential fixture ids are not production Clerk ids
 * (`orginv_` plus a non-numeric token).
 */
export async function cleanupStaleTestInvitationFixtures(database: PrismaClient): Promise<{
  invitations: number;
  queuedGroups: number;
}> {
  const stale = await database.teamInvitation.findMany({
    select: { id: true, clerkOrganizationInvitationId: true },
  });
  const ids = stale
    .filter((row) => LEGACY_FIXTURE_INVITATION_ID.test(row.clerkOrganizationInvitationId))
    .map((row) => row.id);
  if (ids.length === 0) {
    return { invitations: 0, queuedGroups: 0 };
  }
  const queued = await database.teamInvitationSecurityGroup.deleteMany({
    where: { teamInvitationId: { in: ids } },
  });
  const invitations = await database.teamInvitation.deleteMany({
    where: { id: { in: ids } },
  });
  return { invitations: invitations.count, queuedGroups: queued.count };
}
