import { spawnSync } from "node:child_process";

import { runWithTestEnv } from "./load-test-env.mjs";

const mode = process.argv[2];
const extraArgs = process.argv.slice(3);

if (mode !== "dev" && mode !== "deploy") {
  throw new Error("Usage: node scripts/apply-migrations.mjs <dev|deploy> [...prisma args]");
}

function runDevelopmentPrisma(args) {
  const result = spawnSync("corepack", ["pnpm", "exec", "prisma", ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status) {
    process.exit(result.status);
  }
}

const developmentArgs = mode === "dev" ? ["migrate", "dev", ...extraArgs] : ["migrate", "deploy", ...extraArgs];

console.info(
  mode === "dev"
    ? "Applying migrations to the development database (prisma migrate dev)..."
    : "Applying committed migrations to the development database (prisma migrate deploy)...",
);
runDevelopmentPrisma(developmentArgs);

console.info("Applying the same committed migrations to the isolated test database...");
runWithTestEnv("corepack", ["pnpm", "exec", "prisma", "migrate", "deploy"]);
