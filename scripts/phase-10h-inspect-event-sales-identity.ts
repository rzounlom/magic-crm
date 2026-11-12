/**
 * Phase 10H — Read-only inspect synthetic tenant users/groups for Event Sales-only identity.
 * Never modifies Generations. Never prints emails in full if avoidable — redacts local-part middle.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { PERMISSIONS } from "@/types/permissions";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const SYNTHETIC_SLUG = "magiccrm-test-center-b";
const GENERATIONS_ID = "mdutc2nkvpafezukeem8942v";
const OUT = path.join("playwright", ".fixtures", "phase-10h-event-sales-identity.json");

function redactEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const shown = local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***`;
  return `${shown}@${domain}`;
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const env = parseRuntimeEnv(process.env);
  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes("ep-bold-art")) {
    throw new Error(`Refused: unexpected host ${host}`);
  }

  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  if (!pk.startsWith("pk_test_") || sk.startsWith("sk_live_")) {
    throw new Error("Refused: Clerk keys are not TEST.");
  }

  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const org = await database.organization.findFirst({
      where: { slug: SYNTHETIC_SLUG },
      select: { id: true, slug: true, name: true },
    });
    if (!org) throw new Error("Synthetic org missing");
    if (org.id === GENERATIONS_ID) throw new Error("Synthetic org id collides with Generations");

    const groups = await database.securityGroup.findMany({
      where: { organizationId: org.id },
      select: {
        id: true,
        name: true,
        systemKey: true,
        permissions: { select: { permissionDefinition: { select: { key: true } } } },
        members: {
          select: {
            userProfile: {
              select: {
                id: true,
                email: true,
                clerkUserId: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    const groupSummary = groups.map((g) => {
      const keys = new Set(g.permissions.map((p) => p.permissionDefinition.key));
      return {
        id: g.id,
        systemKey: g.systemKey,
        name: g.name,
        hasLocationsManage: keys.has(PERMISSIONS.LOCATIONS_MANAGE),
        hasQuotesApprove: keys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
        hasPriceOverride: keys.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE),
        memberCount: g.members.length,
        members: g.members.map((m) => ({
          userProfileId: m.userProfile.id,
          emailRedacted: redactEmail(m.userProfile.email),
          clerkUserIdPrefix: m.userProfile.clerkUserId?.slice(0, 8) ?? null,
          name: [m.userProfile.firstName, m.userProfile.lastName].filter(Boolean).join(" ") || null,
        })),
      };
    });

    // Users with any membership in this org — detect dual-role
    const byUser = new Map<
      string,
      {
        userProfileId: string;
        emailRedacted: string | null;
        groups: string[];
        hasAdmin: boolean;
        hasEventSales: boolean;
        hasLocationsManage: boolean;
        hasQuotesApprove: boolean;
        hasPriceOverride: boolean;
      }
    >();

    for (const g of groupSummary) {
      for (const member of g.members) {
        const existing = byUser.get(member.userProfileId) ?? {
          userProfileId: member.userProfileId,
          emailRedacted: member.emailRedacted,
          groups: [],
          hasAdmin: false,
          hasEventSales: false,
          hasLocationsManage: false,
          hasQuotesApprove: false,
          hasPriceOverride: false,
        };
        existing.groups.push(g.systemKey ?? g.name);
        if (g.systemKey === "administrators") existing.hasAdmin = true;
        if (g.systemKey === "event_sales") existing.hasEventSales = true;
        if (g.hasLocationsManage) existing.hasLocationsManage = true;
        if (g.hasQuotesApprove) existing.hasQuotesApprove = true;
        if (g.hasPriceOverride) existing.hasPriceOverride = true;
        byUser.set(member.userProfileId, existing);
      }
    }

    const users = [...byUser.values()];
    const eventSalesOnlyCandidates = users.filter(
      (u) =>
        u.hasEventSales &&
        !u.hasAdmin &&
        !u.hasLocationsManage &&
        u.hasQuotesApprove &&
        !u.hasPriceOverride,
    );

    const payload = {
      org,
      clerkPublishableKeyKind: "test",
      databaseHost: host,
      groups: groupSummary.map(({ members, ...rest }) => ({
        ...rest,
        members: members.map((m) => ({
          userProfileId: m.userProfileId,
          emailRedacted: m.emailRedacted,
          clerkUserIdPrefix: m.clerkUserIdPrefix,
        })),
      })),
      users,
      eventSalesOnlyCandidates,
      recommendation:
        eventSalesOnlyCandidates.length > 0
          ? "Reuse an Event Sales-only candidate below for headed Clerk TEST sign-in."
          : "No Event Sales-only member found. Owner must add a TEST user to Event Sales only (not Administrators) on magiccrm-test-center-b, then bootstrap headed auth.",
    };
    writeFileSync(OUT, JSON.stringify(payload, null, 2));
    process.stdout.write(`${JSON.stringify({ ok: true, out: OUT, ...payload }, null, 2)}\n`);
  } finally {
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
