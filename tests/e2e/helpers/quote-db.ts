import { execFileSync } from "node:child_process";
import path from "node:path";

export type StoredQuoteCents = {
  planId: string;
  estimatedTotalCents: number | null;
  unitPriceCents: number | null;
  quantity: number | null;
  guestCount: number | null;
  lineCount: number;
};

function runTsx(scriptRel: string, args: string[]): string {
  const script = path.join(process.cwd(), scriptRel);
  return execFileSync(
    "corepack",
    ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.json", script, ...args],
    {
      encoding: "utf8",
      env: process.env,
      cwd: process.cwd(),
      maxBuffer: 2 * 1024 * 1024,
    },
  ).trim();
}

export function readStoredUnitCents(options: {
  organizationId: string;
  inquiryId: string;
  lineIndex?: number;
}): StoredQuoteCents | null {
  const raw = runTsx("scripts/e2e-read-quote-cents.ts", [
    options.organizationId,
    options.inquiryId,
    String(options.lineIndex ?? 0),
  ]);
  if (!raw || raw === "null") return null;
  return JSON.parse(raw) as StoredQuoteCents;
}

export function probeEventSalesOverride(options: {
  organizationId: string;
  inquiryId: string;
  clerkUserId: string;
}): {
  rejected: boolean;
  code: string | null;
  beforeCents: number | null;
  afterCents: number | null;
  ok: boolean;
} {
  const raw = runTsx("scripts/e2e-probe-event-sales-override.ts", [
    options.organizationId,
    options.inquiryId,
    options.clerkUserId,
  ]);
  return JSON.parse(raw) as {
    rejected: boolean;
    code: string | null;
    beforeCents: number | null;
    afterCents: number | null;
    ok: boolean;
  };
}
