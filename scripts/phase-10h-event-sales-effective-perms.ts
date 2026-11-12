import { writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { PERMISSIONS } from "@/types/permissions";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const SYNTHETIC = "huqlb9wiygqegwo8fy53f8dw";
const USER = "gi65ky8pti383vlzta4no86f";
const OUT = path.join("playwright", ".fixtures", "phase-10h-event-sales-effective-perms.json");

async function main() {
  const env = parseRuntimeEnv(process.env);
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const memberships = await db.securityGroupMember.findMany({
      where: { organizationId: SYNTHETIC, userProfileId: USER },
      select: {
        securityGroup: {
          select: {
            systemKey: true,
            name: true,
            permissions: { select: { permissionDefinition: { select: { key: true } } } },
          },
        },
      },
    });
    const profile = await db.userProfile.findFirst({
      where: { id: USER, organizationId: SYNTHETIC },
      select: { id: true, clerkUserId: true, email: true },
    });
    const keys = new Set(
      memberships.flatMap((m) => m.securityGroup.permissions.map((p) => p.permissionDefinition.key)),
    );
    const payload = {
      userProfileId: USER,
      clerkUserIdPrefix: profile?.clerkUserId?.slice(0, 10) ?? null,
      emailRedacted: profile?.email ? `${profile.email.slice(0, 2)}***@${profile.email.split("@")[1]}` : null,
      groups: memberships.map((m) => m.securityGroup.systemKey),
      hasApprove: keys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
      hasPriceOverride: keys.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
      hasLocationsManage: keys.has(PERMISSIONS.LOCATIONS_MANAGE),
      hasInquiriesManage: keys.has(PERMISSIONS.CRM_INQUIRIES_MANAGE),
      allKeysCount: keys.size,
    };
    writeFileSync(OUT, JSON.stringify(payload, null, 2));
    console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
