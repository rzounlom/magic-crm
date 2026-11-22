/**
 * Attempts an unauthorized unit-cent override as Event Sales; prints JSON result.
 * Usage: tsx scripts/e2e-probe-event-sales-override.ts <organizationId> <inquiryId> <clerkUserId>
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { isAuthorizationError } from "@/server/errors";
import type { RequestContext } from "@/server/request-context";
import { updateWpStaffQuoteDraft } from "@/server/services/wp-staff-quote-draft-service";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });
config({ path: ".env.e2e", override: true, quiet: true });

async function readUnit(
  db: ReturnType<typeof createPrismaClient>,
  organizationId: string,
  inquiryId: string,
) {
  const draft = await db.eventPlanRecommendation.findFirst({
    where: { organizationId, inquiryId, kind: "AGENT_WORKING" },
    orderBy: { updatedAt: "desc" },
  });
  if (!draft) return null;
  const payload =
    draft.payload && typeof draft.payload === "object"
      ? (draft.payload as { lineItems?: Array<{ unitPriceCents?: number }> })
      : {};
  const lines = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  return lines[0]?.unitPriceCents ?? null;
}

async function main() {
  const organizationId = process.argv[2];
  const inquiryId = process.argv[3];
  const clerkUserId = process.argv[4];
  if (!organizationId || !inquiryId || !clerkUserId) {
    throw new Error(
      "Usage: e2e-probe-event-sales-override <organizationId> <inquiryId> <clerkUserId>",
    );
  }

  const env = parseRuntimeEnv(process.env);
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const beforeCents = await readUnit(db, organizationId, inquiryId);
    const profile = await db.userProfile.findFirst({
      where: { clerkUserId, organizationId },
      select: { id: true, clerkUserId: true },
    });
    const org = await db.organization.findFirst({
      where: { id: organizationId },
      select: { clerkOrganizationId: true },
    });
    if (!profile?.id || !profile.clerkUserId || !org?.clerkOrganizationId) {
      throw new Error("Could not resolve Event Sales RequestContext.");
    }

    const draft = await db.eventPlanRecommendation.findFirst({
      where: { organizationId, inquiryId, kind: "AGENT_WORKING" },
      orderBy: { updatedAt: "desc" },
    });
    if (!draft) throw new Error("Missing working draft.");
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
    const mutated = lines.map((line, index) =>
      index === 0 ? { ...line, unitPriceCents: line.unitPriceCents + 999 } : line,
    );
    const ctx: RequestContext = {
      organizationId,
      userId: profile.id,
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: org.clerkOrganizationId,
    };

    let rejected = false;
    let code: string | null = null;
    try {
      await updateWpStaffQuoteDraft(ctx, db, inquiryId, {
        guestCount: payload.guestCount ?? 10,
        eventDate: payload.eventDate ?? null,
        startTime: payload.startTime ?? null,
        durationMinutes: payload.durationMinutes ?? 120,
        lineItems: mutated,
        adjustmentNote: payload.adjustmentNote ?? null,
        editReason: "E2E unauthorized override probe",
      });
    } catch (error) {
      rejected = true;
      code = isAuthorizationError(error)
        ? error.code
        : error instanceof Error
          ? error.message
          : "unknown";
    }

    const afterCents = await readUnit(db, organizationId, inquiryId);
    console.log(
      JSON.stringify({
        rejected,
        code,
        beforeCents,
        afterCents,
        ok: rejected && code === "FORBIDDEN" && afterCents === beforeCents,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
