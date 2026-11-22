import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { config } from "dotenv";

import { assertLocalhostBaseUrl } from "./helpers/e2e-auth";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });
config({ path: ".env.e2e", override: true, quiet: true });

setup.describe.configure({ mode: "serial" });

setup("clerk testing token + sign-in health", async () => {
  const baseURL = assertLocalhostBaseUrl(
    process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
  );

  const secret = process.env.CLERK_SECRET_KEY ?? "";
  const publishable =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY ?? "";
  if (!secret.startsWith("sk_test_")) {
    throw new Error(
      "CLERK_SECRET_KEY must be a Clerk TEST secret (sk_test_). Refusing Production keys for E2E.",
    );
  }
  if (!publishable.startsWith("pk_test_")) {
    throw new Error(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a Clerk TEST publishable key (pk_test_).",
    );
  }

  const health = await fetch(`${baseURL}/sign-in`, { redirect: "manual" });
  if (health.status !== 200) {
    throw new Error(
      `/sign-in returned HTTP ${health.status} at ${baseURL}. Start the app with: pnpm exec next start -p 3000 (or pnpm dev) before E2E.`,
    );
  }

  await clerkSetup({
    publishableKey: publishable,
    secretKey: secret,
    dotenv: false,
  });
});
