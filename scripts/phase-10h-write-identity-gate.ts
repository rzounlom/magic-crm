/**
 * Phase 10H — Write gitignored identity gate for Event Sales bootstrap (full email for gate only).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { PERMISSIONS } from "@/types/permissions";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const SYNTHETIC = "huqlb9wiygqegwo8fy53f8dw";
const EVENT_SALES_PROFILE = "gi65ky8pti383vlzta4no86f";
const ADMIN_PROFILE = "l7ujr6k3pjpwt69bkjm61yew";
const OUT = path.join("playwright", ".fixtures", "phase-10h-event-sales-identity-gate.json");

async function main() {
  const env = parseRuntimeEnv(process.env);
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const [eventSales, admin, memberships] = await Promise.all([
      db.userProfile.findFirst({
        where: { id: EVENT_SALES_PROFILE, organizationId: SYNTHETIC },
        select: { id: true, email: true, clerkUserId: true, firstName: true, lastName: true },
      }),
      db.userProfile.findFirst({
        where: { id: ADMIN_PROFILE, organizationId: SYNTHETIC },
        select: { id: true, email: true, clerkUserId: true },
      }),
      db.securityGroupMember.findMany({
        where: { organizationId: SYNTHETIC, userProfileId: EVENT_SALES_PROFILE },
        select: {
          securityGroup: {
            select: {
              systemKey: true,
              permissions: { select: { permissionDefinition: { select: { key: true } } } },
            },
          },
        },
      }),
    ]);
    if (!eventSales?.email || !eventSales.clerkUserId) {
      throw new Error("Event Sales profile incomplete");
    }
    const keys = new Set(
      memberships.flatMap((m) => m.securityGroup.permissions.map((p) => p.permissionDefinition.key)),
    );
    const groups = memberships.map((m) => m.securityGroup.systemKey).filter(Boolean);
    if (groups.includes("administrators")) {
      throw new Error("Event Sales candidate unexpectedly in administrators");
    }
    writeFileSync(
      OUT,
      `${JSON.stringify(
        {
          organizationId: SYNTHETIC,
          organizationSlug: "magiccrm-test-center-b",
          eventSales: {
            userProfileId: eventSales.id,
            email: eventSales.email,
            clerkUserId: eventSales.clerkUserId,
            display: [eventSales.firstName, eventSales.lastName].filter(Boolean).join(" ") || null,
            groups,
            permissions: {
              locationsManage: keys.has(PERMISSIONS.LOCATIONS_MANAGE),
              quotesApprove: keys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
              priceOverride: keys.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
            },
          },
          rejectAdministrator: {
            userProfileId: admin?.id ?? null,
            email: admin?.email ?? null,
            clerkUserId: admin?.clerkUserId ?? null,
          },
          note: "Gitignored identity gate. Bootstrap must match eventSales.clerkUserId before saving storage.",
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          out: OUT,
          eventSalesEmailPrefix: eventSales.email.slice(0, 2),
          eventSalesClerkPrefix: eventSales.clerkUserId.slice(0, 10),
          permissions: {
            locationsManage: keys.has(PERMISSIONS.LOCATIONS_MANAGE),
            quotesApprove: keys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
            priceOverride: keys.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
          },
          groups,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
