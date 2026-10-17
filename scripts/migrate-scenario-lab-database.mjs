/**
 * Apply committed Prisma migrations to the Scenario Lab database only.
 * Uses .env.scenario-lab.local — never .env or .env.test.
 *
 * Do not run until `pnpm scenario-lab:verify-database` has been reviewed and approved.
 *
 * Usage: pnpm scenario-lab:migrate-deploy
 */

import { runWithScenarioLabEnv, loadScenarioLabEnv } from "./load-scenario-lab-env.mjs";

const loaded = loadScenarioLabEnv();
console.info("[scenario-lab] migrate deploy target identity:", loaded.identity);
console.info("[scenario-lab] pooled host:", loaded.pooled.host);
console.info("[scenario-lab] Applying prisma migrate deploy (no reset, no db push)…");

runWithScenarioLabEnv("corepack", ["pnpm", "exec", "prisma", "migrate", "deploy"]);
