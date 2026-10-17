import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke + authenticated staff scenarios (R3).
 * Base URL from PLAYWRIGHT_BASE_URL (default http://localhost:3000).
 * Public intake slug from PLAYWRIGHT_PUBLIC_ORG_SLUG (required for intake specs).
 * Staff specs require a gitignored Clerk TEST storage state (see tests/e2e/README.md).
 * Does not write production data; prefer read-only / invalid-token journeys.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results/playwright",
  use: {
    baseURL,
    // Staff /app can wait on Clerk + awareness; prefer navigation timeout over default load hangs.
    navigationTimeout: 45_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Videos help solo debugging of headed staff flows; retained on failure only.
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // Chromium + phone viewport (avoid WebKit binary requirement for local smoke).
      name: "chromium-mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
