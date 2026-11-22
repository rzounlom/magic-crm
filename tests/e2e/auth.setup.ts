import fs from "node:fs";
import path from "node:path";

import { clerk } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";
import { config } from "dotenv";

import {
  assertLocalhostBaseUrl,
  defaultE2EEmail,
  E2E_CLERK_AUTH_DIR,
  E2E_ROLE_META,
  E2E_ROLE_STORAGE,
  e2eRoleEmailEnv,
  identityForRole,
  isSyntheticOrgChip,
  redactEmail,
  resolveE2EIdentities,
  type E2EAuthMeta,
  type E2ERole,
} from "./helpers/e2e-auth";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });
config({ path: ".env.e2e", override: true, quiet: true });

setup.describe.configure({ mode: "serial" });

const ROLES: E2ERole[] = ["administrator", "event_sales", "front_desk"];

async function activateOrg(page: import("@playwright/test").Page, clerkOrganizationId: string) {
  await page.evaluate(async (orgId) => {
    type ClerkLike = {
      load?: () => Promise<void>;
      setActive?: (args: { organization: string }) => Promise<void>;
      organization?: { id?: string } | null;
    };
    const clerkClient = (window as unknown as { Clerk?: ClerkLike }).Clerk;
    if (!clerkClient) throw new Error("window.Clerk missing after sign-in.");
    await clerkClient.load?.();
    await clerkClient.setActive?.({ organization: orgId });
  }, clerkOrganizationId);

  await page.goto("/app", { waitUntil: "networkidle" });
  if (page.url().includes("sign-in")) {
    throw new Error("Signed-in session redirected to /sign-in — auth failed.");
  }

  // Fallback UI org switch if setActive did not bind employee context yet.
  let chip = "";
  try {
    chip = (await page.locator("[data-employee-context]").first().innerText())
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    chip = "";
  }
  if (!isSyntheticOrgChip(chip)) {
    const orgBtn = page.getByRole("button", { name: /organization|Open organization/i }).first();
    if (await orgBtn.count()) {
      await orgBtn.click();
      await page
        .getByRole("button", { name: /MagicCRM Test Center B/i })
        .first()
        .click({ timeout: 15_000 });
      await page.waitForTimeout(1500);
      await page.goto("/app", { waitUntil: "networkidle" });
      chip = ((await page.locator("[data-employee-context]").first().innerText()) || "")
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  expect(isSyntheticOrgChip(chip), `Expected Test Center B context, got: ${chip}`).toBeTruthy();
}

for (const role of ROLES) {
  setup(`authenticate ${role}`, async ({ page }) => {
    const baseURL = assertLocalhostBaseUrl(
      process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    );
    const identities = resolveE2EIdentities();
    if (!identities.ok) {
      throw new Error(identities.reason);
    }

    const identity = identityForRole(identities.fixture, role);
    if (!identity?.email) {
      throw new Error(
        `Missing ${role} identity in fixture. Re-run: pnpm test:e2e:provision`,
      );
    }

    const envName = e2eRoleEmailEnv(role);
    const email = (process.env[envName] ?? identity.email ?? defaultE2EEmail(role))
      .trim()
      .toLowerCase();
    if (!email.includes("+clerk_test@")) {
      throw new Error(
        `${envName} must use a +clerk_test address (got ${redactEmail(email)}).`,
      );
    }

    fs.mkdirSync(E2E_CLERK_AUTH_DIR, { recursive: true });
    fs.mkdirSync(path.join("playwright", ".auth"), { recursive: true });

    await page.goto(`${baseURL}/sign-in`, { waitUntil: "domcontentloaded" });
    await clerk.signIn({ page, emailAddress: email });
    await activateOrg(page, identities.fixture.clerkOrganizationId);

    const live = await page.evaluate(async () => {
      type ClerkLike = {
        user?: { id?: string };
        load?: () => Promise<void>;
      };
      const clerkClient = (window as unknown as { Clerk?: ClerkLike }).Clerk;
      await clerkClient?.load?.();
      return { clerkUserId: clerkClient?.user?.id ?? null };
    });
    if (!live.clerkUserId || live.clerkUserId !== identity.clerkUserId) {
      throw new Error(
        `${role} session clerkUserId mismatch. Expected ${identity.clerkUserIdPrefix}… from provision fixture.`,
      );
    }

    const storageStatePath = E2E_ROLE_STORAGE[role];
    await page.context().storageState({ path: storageStatePath });

    const publishable =
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY ?? "";
    const meta: E2EAuthMeta = {
      createdAt: new Date().toISOString(),
      role,
      baseUrl: baseURL,
      storageStatePath,
      clerkUserIdPrefix: identity.clerkUserIdPrefix,
      emailRedacted: redactEmail(email),
      organizationSlug: identities.fixture.organizationSlug,
      clerkOrganizationIdPrefix: identities.fixture.clerkOrganizationId.slice(0, 12),
      clerkPublishableKeyKind: publishable.startsWith("pk_test_") ? "test" : "unknown",
      note: "Clerk ticket sign-in via @clerk/testing. No passwords logged. Never commit this file.",
    };
    fs.writeFileSync(E2E_ROLE_META[role], `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });

    // Backward-compatible aliases for older staff helpers / scripts.
    if (role === "administrator") {
      fs.copyFileSync(storageStatePath, path.join("playwright", ".auth", "staff.json"));
      fs.writeFileSync(
        path.join("playwright", ".auth", "staff.meta.json"),
        `${JSON.stringify(
          {
            createdAt: meta.createdAt,
            baseUrl: baseURL,
            storageStatePath: path.join("playwright", ".auth", "staff.json"),
            clerkPublishableKeyKind: meta.clerkPublishableKeyKind,
            expectedOrganizationSlug: identities.fixture.organizationSlug,
            note: "Alias of playwright/.clerk/administrator.json from automated E2E auth.",
          },
          null,
          2,
        )}\n`,
        { mode: 0o600 },
      );
    }
    if (role === "event_sales") {
      fs.copyFileSync(storageStatePath, path.join("playwright", ".auth", "event-sales.json"));
      fs.writeFileSync(
        path.join("playwright", ".auth", "event-sales.meta.json"),
        `${JSON.stringify(meta, null, 2)}\n`,
        { mode: 0o600 },
      );
    }
  });
}
