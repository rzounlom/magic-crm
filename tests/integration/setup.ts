import { cleanupStaleTestInvitationFixtures } from "../helpers/cleanup-stale-test-invitations";
import { createTestPrismaClient, loadTestDatabaseEnv } from "../helpers/test-database";

const SETUP_TIMEOUT_MS = 15_000;
const DISCONNECT_TIMEOUT_MS = 3_000;

async function withTimeout<T>(work: Promise<T>, label: string, ms = SETUP_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms against the isolated TEST database`));
    }, ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

loadTestDatabaseEnv();

const database = createTestPrismaClient();

async function disconnectQuietly() {
  try {
    await withTimeout(database.$disconnect(), "test database disconnect", DISCONNECT_TIMEOUT_MS);
  } catch {
    // Neon serverless can hang disconnect after a stalled handshake. Do not block Vitest.
  }
}

try {
  await withTimeout(database.$queryRaw`SELECT 1`, "test database ping");
  console.info("[magiccrm] test database ping ok; running stale invitation cleanup");
  const removed = await withTimeout(
    cleanupStaleTestInvitationFixtures(database),
    "cleanupStaleTestInvitationFixtures",
  );
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
  await disconnectQuietly();
} catch (error) {
  await disconnectQuietly();
  console.error(error instanceof Error ? error.message : error);
  // setupFiles are not bound by hookTimeout; exit so a hung Prisma socket cannot stall the suite.
  process.exit(1);
}
