import { runWithTestEnv } from "./load-test-env.mjs";

runWithTestEnv("corepack", ["pnpm", "exec", "prisma", "migrate", "deploy"]);
runWithTestEnv("corepack", [
  "pnpm",
  "exec",
  "tsx",
  "--tsconfig",
  "tsconfig.json",
  "scripts/sync-auth-reference-data.ts",
]);
