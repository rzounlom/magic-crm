import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { createClerkClient } from "@clerk/backend";
import { config } from "dotenv";

import { createOrganizationDirectory } from "@/lib/auth/create-organization-directory";
import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { createClientTenant } from "@/server/services/create-client-tenant";

if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
  config({ path: ".env.test", override: true });
} else {
  config();
  config({ path: ".env.local", override: true });
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readValue(flag: string, promptLabel: string, fallback?: string): Promise<string> {
  const fromArgs = arg(flag);
  if (fromArgs) {
    return fromArgs;
  }
  if (!process.stdin.isTTY && fallback) {
    return fallback;
  }
  if (!process.stdin.isTTY) {
    throw new Error(`Missing ${flag}. Non-interactive runs must pass organization name and admin email.`);
  }
  const rl = createInterface({ input, output });
  try {
    const value = await rl.question(promptLabel);
    return value.trim() || fallback || "";
  } finally {
    rl.close();
  }
}

async function main() {
  const organizationName = await readValue("--organization-name", "Organization name: ");
  const adminEmail = await readValue("--admin-email", "First admin email: ");
  const timezone = (await readValue("--timezone", "Timezone [UTC]: ", "UTC")) || "UTC";
  const currency = (await readValue("--currency", "Currency [USD]: ", "USD")) || "USD";

  if (!organizationName || !adminEmail) {
    throw new Error(
      "Usage: pnpm tenant:create -- --organization-name <name> --admin-email <email> [--timezone UTC] [--currency USD]",
    );
  }

  console.info("Create MagicCRM client tenant?");
  console.info(`  Name: ${organizationName}`);
  console.info(`  Admin: ${adminEmail}`);
  console.info(`  Timezone: ${timezone}`);
  console.info(`  Currency: ${currency}`);

  const confirmed = arg("--confirm") ?? (await readValue("--confirm", 'Type CREATE to confirm: '));
  if (confirmed !== "CREATE") {
    throw new Error("Aborted. Type CREATE to confirm before creating Clerk and MagicCRM resources.");
  }

  const env = parseRuntimeEnv(process.env);
  if (!env.CLERK_SECRET_KEY) {
    throw new Error("CLERK_SECRET_KEY is required to create a client tenant.");
  }

  const db = createPrismaClient(env.DATABASE_URL);
  const directory = createOrganizationDirectory(createClerkClient({ secretKey: env.CLERK_SECRET_KEY }).organizations);

  try {
    const result = await createClientTenant(db, directory, {
      organizationName,
      adminEmail,
      timezone,
      currency,
    });
    console.info("Client tenant ready.");
    console.info(`  organizationId: ${result.organizationId}`);
    console.info(`  onboardingStatus: ${result.onboardingStatus}`);
    console.info(`  invitationId: ${result.invitationId ?? "none"}`);
    console.info(`  reused: ${result.reused ? "yes" : "no"}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
