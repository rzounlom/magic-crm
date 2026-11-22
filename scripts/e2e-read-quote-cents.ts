/**
 * Prints working-draft unit cents JSON for Playwright (avoids Prisma in the PW runner).
 * Usage: tsx scripts/e2e-read-quote-cents.ts <organizationId> <inquiryId> [lineIndex]
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });
config({ path: ".env.e2e", override: true, quiet: true });

async function main() {
  const organizationId = process.argv[2];
  const inquiryId = process.argv[3];
  const lineIndex = Number(process.argv[4] ?? "0");
  if (!organizationId || !inquiryId) {
    throw new Error("Usage: e2e-read-quote-cents <organizationId> <inquiryId> [lineIndex]");
  }

  const env = parseRuntimeEnv(process.env);
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const draft = await db.eventPlanRecommendation.findFirst({
      where: { organizationId, inquiryId, kind: "AGENT_WORKING" },
      orderBy: { updatedAt: "desc" },
    });
    if (!draft) {
      console.log(JSON.stringify(null));
      return;
    }
    const payload =
      draft.payload && typeof draft.payload === "object"
        ? (draft.payload as {
            lineItems?: Array<{ unitPriceCents?: number; quantity?: number }>;
            guestCount?: number;
          })
        : {};
    const lines = Array.isArray(payload.lineItems) ? payload.lineItems : [];
    console.log(
      JSON.stringify({
        planId: draft.id,
        estimatedTotalCents: draft.estimatedTotalCents,
        unitPriceCents: lines[lineIndex]?.unitPriceCents ?? null,
        quantity: lines[lineIndex]?.quantity ?? null,
        guestCount: payload.guestCount ?? draft.guestCount,
        lineCount: lines.length,
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
