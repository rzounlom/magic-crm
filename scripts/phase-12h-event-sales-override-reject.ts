/**
 * Phase 12H — Prove Event Sales cannot override unit cents on synthetic inquiry.
 * Uses DB permission membership + service call with a synthetic RequestContext.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { isAuthorizationError } from "@/server/errors";
import type { RequestContext } from "@/server/request-context";
import { updateWpStaffQuoteDraft } from "@/server/services/wp-staff-quote-draft-service";
import { PERMISSIONS } from "@/types/permissions";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const SYNTHETIC_ORG = "huqlb9wiygqegwo8fy53f8dw";
const EVENT_SALES_USER = "gi65ky8pti383vlzta4no86f";
const FIXTURE = path.join("playwright", ".fixtures", "phase-10g-wp-inquiry.json");
const OUT = path.join("playwright", ".fixtures", "phase-12h-event-sales-override-reject.json");

async function main() {
  const fixture = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(FIXTURE, "utf8")));
  if (fixture.organizationSlug !== "magiccrm-test-center-b") {
    throw new Error("Fixture is not synthetic.");
  }
  const env = parseRuntimeEnv(process.env);
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const memberships = await db.securityGroupMember.findMany({
      where: { organizationId: SYNTHETIC_ORG, userProfileId: EVENT_SALES_USER },
      select: {
        securityGroup: {
          select: {
            systemKey: true,
            permissions: { select: { permissionDefinition: { select: { key: true } } } },
          },
        },
      },
    });
    const keys = new Set(
      memberships.flatMap((m) => m.securityGroup.permissions.map((p) => p.permissionDefinition.key)),
    );
    if (keys.has(PERMISSIONS.CRM_QUOTES_PRICE_OVERRIDE)) {
      throw new Error("Event Sales unexpectedly has price override — refusing.");
    }

    const draft = await db.eventPlanRecommendation.findFirst({
      where: {
        organizationId: SYNTHETIC_ORG,
        inquiryId: fixture.inquiryId,
        kind: "AGENT_WORKING",
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!draft) throw new Error("Missing staff quote draft for synthetic inquiry.");
    const payload = draft.payload as {
      lineItems?: Array<{
        slug: string;
        name: string;
        quantity: number;
        unitPriceCents: number;
        kind: string;
      }>;
      guestCount?: number;
      eventDate?: string | null;
      startTime?: string | null;
      durationMinutes?: number;
      adjustmentNote?: string | null;
    };
    const lines = payload.lineItems ?? [];
    if (!lines.length) throw new Error("Draft has no line items.");

    const profile = await db.userProfile.findFirst({
      where: { id: EVENT_SALES_USER, organizationId: SYNTHETIC_ORG },
      select: { clerkUserId: true },
    });
    const org = await db.organization.findFirst({
      where: { id: SYNTHETIC_ORG },
      select: { clerkOrganizationId: true },
    });
    if (!profile?.clerkUserId || !org?.clerkOrganizationId) {
      throw new Error("Missing Clerk identity fields for Event Sales probe.");
    }

    const ctx: RequestContext = {
      organizationId: SYNTHETIC_ORG,
      userId: EVENT_SALES_USER,
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: org.clerkOrganizationId,
    };

    const mutated = lines.map((line, index) =>
      index === 0
        ? { ...line, unitPriceCents: (line.unitPriceCents ?? 0) + 2500 }
        : { ...line },
    );

    let rejected = false;
    let code: string | null = null;
    try {
      await updateWpStaffQuoteDraft(ctx, db, fixture.inquiryId, {
        guestCount: payload.guestCount ?? 10,
        eventDate: payload.eventDate ?? null,
        startTime: payload.startTime ?? null,
        durationMinutes: payload.durationMinutes ?? 120,
        lineItems: mutated,
        adjustmentNote: payload.adjustmentNote ?? null,
        editReason: "Phase 12H Event Sales unauthorized override probe",
      });
    } catch (error) {
      rejected = true;
      code = isAuthorizationError(error) ? error.code : error instanceof Error ? error.message : "unknown";
    }

    const after = await db.eventPlanRecommendation.findFirst({
      where: { id: draft.id },
    });
    const afterPayload = after?.payload as { lineItems?: Array<{ unitPriceCents?: number }> };
    const afterCents = afterPayload?.lineItems?.[0]?.unitPriceCents ?? null;
    const beforeCents = lines[0]?.unitPriceCents ?? null;
    const unchanged = afterCents === beforeCents;

    const result = {
      ok: rejected && unchanged,
      rejected,
      code,
      beforeCents,
      afterCents,
      hasPriceOverride: false,
      hasApprove: keys.has(PERMISSIONS.CRM_QUOTES_APPROVE),
      groups: memberships.map((m) => m.securityGroup.systemKey),
    };
    writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
