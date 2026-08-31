import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { recordAuditEvent } from "@/server/services/audit";

if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
  config({ path: ".env.test", override: true });
} else {
  config();
  config({ path: ".env.local", override: true });
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const organizationId = arg("--organization-id");
  const userProfileId = arg("--user-profile-id");

  if (!organizationId || !userProfileId) {
    throw new Error(
      "Usage: pnpm auth:bootstrap-admin -- --organization-id <id> --user-profile-id <id>",
    );
  }

  const env = parseRuntimeEnv(process.env);
  const db = createPrismaClient(env.DATABASE_URL);

  try {
    const profile = await db.userProfile.findFirst({
      where: { id: userProfileId, organizationId },
    });

    if (!profile) {
      throw new Error("That user profile does not belong to the given organization.");
    }

    const administrators = await db.securityGroup.findFirst({
      where: { organizationId, systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS },
    });

    if (!administrators) {
      throw new Error("Administrators group is missing. Run pnpm db:sync-auth first.");
    }

    await db.securityGroupMember.upsert({
      where: {
        securityGroupId_userProfileId: {
          securityGroupId: administrators.id,
          userProfileId,
        },
      },
      create: {
        organizationId,
        securityGroupId: administrators.id,
        userProfileId,
      },
      update: {},
    });

    await recordAuditEvent(db, {
      organizationId,
      actorUserProfileId: userProfileId,
      action: "security_group.administrator_bootstrapped",
      resourceType: "security_group",
      resourceId: administrators.id,
      metadata: { source: "cli" },
    });

    console.info("Administrator membership ensured.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
