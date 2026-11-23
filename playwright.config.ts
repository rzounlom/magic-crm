import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

import { E2E_ROLE_STORAGE } from "./tests/e2e/helpers/e2e-auth";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });
config({ path: ".env.e2e", override: true, quiet: true });

/**
 * Browser smoke + authenticated staff / quote (12I) / employee regression (12J).
 * Base URL from PLAYWRIGHT_BASE_URL (default http://localhost:3000 — never 127.0.0.1).
 * Role sessions: Playwright setup projects + @clerk/testing ticket sign-in.
 */

const EMPLOYEE_AND_QUOTE_IGNORE =
  /clerk\.setup\.ts|auth\.setup\.ts|quote-.*\.acceptance\.spec\.ts|employee-.*\.spec\.ts/;
const rawBase = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
if (rawBase.includes("127.0.0.1")) {
  throw new Error(
    "PLAYWRIGHT_BASE_URL must use http://localhost:3000 — never 127.0.0.1 (self-proxy 500).",
  );
}
const baseURL = rawBase.replace(/\/$/, "");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results/playwright",
  use: {
    baseURL,
    navigationTimeout: 45_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup-clerk",
      testMatch: /clerk\.setup\.ts/,
    },
    {
      name: "setup-auth",
      testMatch: /auth\.setup\.ts/,
      dependencies: ["setup-clerk"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-desktop",
      testIgnore: [EMPLOYEE_AND_QUOTE_IGNORE],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-mobile",
      testIgnore: [EMPLOYEE_AND_QUOTE_IGNORE],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "quote-admin",
      dependencies: ["setup-auth"],
      testMatch: /quote-admin\.acceptance\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: E2E_ROLE_STORAGE.administrator,
      },
    },
    {
      name: "quote-event-sales",
      dependencies: ["setup-auth"],
      testMatch: /quote-event-sales\.acceptance\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: E2E_ROLE_STORAGE.event_sales,
      },
    },
    {
      name: "quote-front-desk",
      dependencies: ["setup-auth"],
      testMatch: /quote-front-desk\.acceptance\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: E2E_ROLE_STORAGE.front_desk,
      },
    },
    {
      name: "employee-admin",
      dependencies: ["setup-auth"],
      testMatch: /employee-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: E2E_ROLE_STORAGE.administrator,
      },
    },
    {
      name: "employee-event-sales",
      dependencies: ["setup-auth"],
      testMatch: /employee-(nav\.by-role|home-queue|wp-workflow|bookings-schedule(?:-security)?)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: E2E_ROLE_STORAGE.event_sales,
      },
    },
    {
      name: "employee-front-desk",
      dependencies: ["setup-auth"],
      testMatch: /employee-(nav\.by-role|bookings-schedule(?:-security)?)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: E2E_ROLE_STORAGE.front_desk,
      },
    },
  ],
});
