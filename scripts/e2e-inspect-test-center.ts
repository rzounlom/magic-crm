import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

async function main() {
  const env = parseRuntimeEnv(process.env);
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const org = await db.organization.findFirst({
      where: { slug: "magiccrm-test-center-b" },
      select: { id: true, slug: true, clerkOrganizationId: true, name: true },
    });
    const groups = org
      ? await db.securityGroup.findMany({
          where: { organizationId: org.id },
          select: { id: true, systemKey: true, name: true },
        })
      : [];
    console.log(JSON.stringify({ org, groups }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
