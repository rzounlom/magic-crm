/**
 * Phase 10N — read-only lookup of an existing Generations WP inquiry with calc + quote draft.
 * Does not create or modify records.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

const ORG_ID = "mdutc2nkvpafezukeem8942v";
const OUT = path.join("playwright", ".fixtures", "phase-10n-generations-inquiry.json");

async function main() {
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const candidates = await database.inquiry.findMany({
      where: { organizationId: ORG_ID },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        status: true,
        source: true,
        customerGroupName: true,
        selectedEventPlanId: true,
        agentWorkingPlanId: true,
        humanHandoffReason: true,
        updatedAt: true,
        eventPlanRecommendations: {
          select: { id: true, tier: true, title: true },
          take: 6,
        },
        conversations: {
          select: {
              messages: {
              select: { metadata: true, senderType: true },
              take: 20,
              orderBy: { createdAt: "asc" },
            },
          },
          take: 1,
        },
      },
    });

    const scored = candidates.map((row) => {
      const messages = row.conversations[0]?.messages ?? [];
      const hasWpCalc = messages.some((message) => {
        const meta = message.metadata;
        if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
        return "privateCalculation" in meta || "wpIntake" in meta || "answers" in meta;
      });
      const hasDraft = Boolean(row.agentWorkingPlanId || row.selectedEventPlanId);
      const isWpReason =
        row.humanHandoffReason === "PUBLIC_EVENT_REQUEST" ||
        String(row.source ?? "").toLowerCase().includes("wp") ||
        String(row.source ?? "").toLowerCase().includes("wordpress") ||
        String(row.source ?? "").toLowerCase().includes("event");
      return {
        id: row.id,
        status: row.status,
        source: row.source,
        handoff: row.humanHandoffReason,
        hasWpCalc,
        hasDraft,
        isWpReason,
        planCount: row.eventPlanRecommendations.length,
        score: Number(hasWpCalc) * 4 + Number(hasDraft) * 2 + Number(isWpReason),
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored.find((row) => row.hasWpCalc && row.hasDraft) ?? scored.find((row) => row.hasWpCalc) ?? null;
    const selected = best ? candidates.find((row) => row.id === best.id) ?? null : null;

    const payload = {
      organizationId: ORG_ID,
      candidateCount: candidates.length,
      selected: selected
        ? {
            inquiryId: selected.id,
            inquiryPath: `/app/inquiries/${selected.id}`,
            status: selected.status,
            source: selected.source,
            humanHandoffReason: selected.humanHandoffReason,
            hasSelectedEventPlan: Boolean(selected.selectedEventPlanId),
            hasWorkingPlan: Boolean(selected.agentWorkingPlanId),
            hasWpCalc: best?.hasWpCalc ?? false,
            planTiers: selected.eventPlanRecommendations.map((plan) => plan.tier),
            customerLabel: selected.customerGroupName ? "[redacted]" : null,
            updatedAt: selected.updatedAt,
          }
        : null,
      topScores: scored.slice(0, 10),
    };

    writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
