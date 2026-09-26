import { cleanupStaleTestInvitationFixtures } from "../helpers/cleanup-stale-test-invitations";
import { createTestPrismaClient, loadTestDatabaseEnv } from "../helpers/test-database";

loadTestDatabaseEnv();

const database = createTestPrismaClient();
const removed = await cleanupStaleTestInvitationFixtures(database);
await database.$disconnect();
if (removed.invitations > 0 || removed.queuedGroups > 0) {
  console.info(
    JSON.stringify({
      scope: "magiccrm.test",
      event: "stale_test_invitation_fixtures_removed",
      invitations: removed.invitations,
      queuedGroups: removed.queuedGroups,
      databaseRole: "test",
    }),
  );
}
