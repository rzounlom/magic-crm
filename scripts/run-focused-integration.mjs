import { runWithTestEnv } from "./load-test-env.mjs";

const files = process.argv.slice(2);
if (files.length === 0) {
  throw new Error("Usage: node scripts/run-focused-integration.mjs <test-file> [...more]");
}

runWithTestEnv("corepack", [
  "pnpm",
  "exec",
  "vitest",
  "run",
  "--config",
  "vitest.integration.config.mts",
  ...files,
]);
