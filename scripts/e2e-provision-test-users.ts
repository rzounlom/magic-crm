/**
 * One-time / idempotent E2E identity provisioning for magiccrm-test-center-b.
 *
 * Creates Clerk DEV users with +clerk_test emails (no outbound email),
 * adds them to the synthetic Clerk organization, ensures MagicCRM UserProfiles,
 * and assigns exact system security groups (no extras).
 *
 * Never prints secrets. Refuses LIVE Clerk keys and non-DEV Neon hosts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { SYSTEM_GROUP_KEYS, type SystemGroupKey } from "@/server/authorization/default-security-groups";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });
config({ path: ".env.e2e", override: true, quiet: true });

const DEV_HOST = "ep-bold-art-avjy5nt4";
const ORG_SLUG = process.env.E2E_ORG_SLUG ?? "magiccrm-test-center-b";
const OUT = path.join("playwright", ".fixtures", "e2e-test-identities.json");

const ROLES: Array<{
  role: "administrator" | "event_sales" | "front_desk";
  emailEnv: string;
  defaultEmail: string;
  systemKey: SystemGroupKey;
  firstName: string;
  lastName: string;
}> = [
  {
    role: "administrator",
    emailEnv: "E2E_CLERK_ADMIN_EMAIL",
    defaultEmail: "e2e.admin+clerk_test@example.com",
    systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS,
    firstName: "E2E",
    lastName: "Admin",
  },
  {
    role: "event_sales",
    emailEnv: "E2E_CLERK_EVENT_SALES_EMAIL",
    defaultEmail: "e2e.event-sales+clerk_test@example.com",
    systemKey: SYSTEM_GROUP_KEYS.EVENT_SALES,
    firstName: "E2E",
    lastName: "EventSales",
  },
  {
    role: "front_desk",
    emailEnv: "E2E_CLERK_FRONT_DESK_EMAIL",
    defaultEmail: "e2e.front-desk+clerk_test@example.com",
    systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK,
    firstName: "E2E",
    lastName: "FrontDesk",
  },
];

function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 3)}***@${domain}`;
}

function requireTestClerk(secretKey: string, publishableKey: string) {
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Refused: CLERK_SECRET_KEY must be TEST (sk_test_).");
  }
  if (!publishableKey.startsWith("pk_test_")) {
    throw new Error("Refused: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be TEST (pk_test_).");
  }
}

async function ensureClerkUser(
  client: ReturnType<typeof createClerkClient>,
  email: string,
  firstName: string,
  lastName: string,
) {
  const existing = await client.users.getUserList({ emailAddress: [email], limit: 10 });
  if (existing.data.length > 0) {
    const user = existing.data[0]!;
    const meta = (user.privateMetadata ?? {}) as Record<string, unknown>;
    if (meta.e2eTestUser !== true) {
      const isSyntheticDefault =
        email.startsWith("e2e.") && email.includes("+clerk_test@");
      if (!isSyntheticDefault) {
        throw new Error(
          `Refused: ${redactEmail(email)} exists but is not marked privateMetadata.e2eTestUser=true.`,
        );
      }
      return client.users.updateUserMetadata(user.id, {
        privateMetadata: {
          ...meta,
          e2eTestUser: true,
          magiccrmRoleHint: "synthetic",
        },
      });
    }
    return user;
  }

  return client.users.createUser({
    emailAddress: [email],
    firstName,
    lastName,
    skipPasswordRequirement: true,
    privateMetadata: {
      e2eTestUser: true,
      magiccrmRoleHint: "synthetic",
    },
  });
}

async function ensureOrgMembership(
  client: ReturnType<typeof createClerkClient>,
  organizationId: string,
  userId: string,
) {
  try {
    await client.organizations.createOrganizationMembership({
      organizationId,
      userId,
      role: "org:member",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already|exists|duplicate/i.test(message)) {
      // Clerk may return structured errors; attempt list check
      const members = await client.organizations.getOrganizationMembershipList({
        organizationId,
        limit: 100,
      });
      const found = members.data.some((row) => row.publicUserData?.userId === userId);
      if (!found) {
        throw error;
      }
    }
  }
}

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }

  const env = parseRuntimeEnv(process.env);
  const clerkSecret = env.CLERK_SECRET_KEY;
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  if (!clerkSecret) {
    throw new Error("CLERK_SECRET_KEY is required for E2E provisioning.");
  }
  requireTestClerk(clerkSecret, publishableKey);

  const host = new URL(env.DATABASE_URL).hostname;
  if (!host.includes(DEV_HOST)) {
    throw new Error(`Refused: unexpected DB host ${host}. Expected DEV ${DEV_HOST}.`);
  }

  const db = createPrismaClient(env.DATABASE_URL);
  const clerk = createClerkClient({ secretKey: clerkSecret });

  try {
    const org = await db.organization.findFirst({
      where: { slug: ORG_SLUG },
      select: {
        id: true,
        slug: true,
        clerkOrganizationId: true,
        name: true,
      },
    });
    if (!org?.clerkOrganizationId) {
      throw new Error(`Organization ${ORG_SLUG} missing or has no clerkOrganizationId.`);
    }

    const location = await db.location.findFirst({
      where: { organizationId: org.id, slug: "main", active: true },
      select: { id: true },
    });
    if (!location) {
      throw new Error(`Active main location missing for ${ORG_SLUG}.`);
    }

    const identities = [];

    for (const role of ROLES) {
      const email = (process.env[role.emailEnv] ?? role.defaultEmail).trim().toLowerCase();
      if (!email.includes("+clerk_test@")) {
        throw new Error(
          `${role.emailEnv} must use a +clerk_test address so Clerk suppresses email delivery.`,
        );
      }

      const user = await ensureClerkUser(clerk, email, role.firstName, role.lastName);
      await ensureOrgMembership(clerk, org.clerkOrganizationId, user.id);

      let profile = await db.userProfile.findFirst({
        where: { organizationId: org.id, clerkUserId: user.id },
        select: { id: true, clerkUserId: true, email: true },
      });
      if (!profile) {
        profile = await db.userProfile.create({
          data: {
            organizationId: org.id,
            clerkUserId: user.id,
            defaultLocationId: location.id,
            email,
            displayName: `${role.firstName} ${role.lastName}`,
          },
          select: { id: true, clerkUserId: true, email: true },
        });
      } else if (!profile.email) {
        await db.userProfile.update({
          where: { id: profile.id },
          data: { email, displayName: `${role.firstName} ${role.lastName}` },
        });
      }

      const targetGroup = await db.securityGroup.findFirst({
        where: { organizationId: org.id, systemKey: role.systemKey },
        select: { id: true, systemKey: true },
      });
      if (!targetGroup) {
        throw new Error(`Missing security group ${role.systemKey}. Run pnpm db:sync-auth.`);
      }

      // Remove memberships in other E2E-managed system groups for this profile.
      const e2eKeys = ROLES.map((row) => row.systemKey);
      const current = await db.securityGroupMember.findMany({
        where: { organizationId: org.id, userProfileId: profile.id },
        select: {
          id: true,
          securityGroupId: true,
          securityGroup: { select: { systemKey: true } },
        },
      });
      for (const membership of current) {
        const key = membership.securityGroup.systemKey;
        if (key && e2eKeys.includes(key as SystemGroupKey) && key !== role.systemKey) {
          await db.securityGroupMember.delete({ where: { id: membership.id } });
        }
      }

      await db.securityGroupMember.upsert({
        where: {
          securityGroupId_userProfileId: {
            securityGroupId: targetGroup.id,
            userProfileId: profile.id,
          },
        },
        create: {
          organizationId: org.id,
          securityGroupId: targetGroup.id,
          userProfileId: profile.id,
        },
        update: {},
      });

      const perms = await db.securityGroupPermission.findMany({
        where: { securityGroupId: targetGroup.id },
        select: { permissionDefinition: { select: { key: true } } },
      });
      const keys = new Set(perms.map((row) => row.permissionDefinition.key));

      identities.push({
        role: role.role,
        emailRedacted: redactEmail(email),
        emailEnv: role.emailEnv,
        email,
        clerkUserIdPrefix: user.id.slice(0, 12),
        clerkUserId: user.id,
        userProfileId: profile.id,
        systemKey: role.systemKey,
        hasPriceOverride: keys.has("crm.quotes.price_override"),
        hasQuotesApprove: keys.has("crm.quotes.approve"),
        hasInquiriesManage: keys.has("crm.inquiries.manage"),
        hasInquiriesView: keys.has("crm.inquiries.view"),
      });
    }

    // Keep full emails only in gitignored fixture for local setup consumers.
    const fixturePayload = {
      ok: true,
      createdAt: new Date().toISOString(),
      organizationSlug: org.slug,
      organizationId: org.id,
      clerkOrganizationId: org.clerkOrganizationId,
      identities,
      note: "Synthetic E2E identities only. Emails use +clerk_test. Never commit secrets.",
    };
    mkdirSync(path.dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(fixturePayload, null, 2)}\n`, { mode: 0o600 });

    console.log(
      JSON.stringify(
        {
          ok: true,
          organizationSlug: org.slug,
          clerkOrganizationIdPrefix: org.clerkOrganizationId.slice(0, 12),
          roles: identities.map((row) => ({
            role: row.role,
            emailRedacted: row.emailRedacted,
            systemKey: row.systemKey,
            hasPriceOverride: row.hasPriceOverride,
            hasQuotesApprove: row.hasQuotesApprove,
            hasInquiriesManage: row.hasInquiriesManage,
          })),
          fixture: OUT,
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
