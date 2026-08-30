import { runWithTestEnv } from "./load-test-env.mjs";

runWithTestEnv("corepack", [
  "pnpm",
  "exec",
  "vitest",
  "run",
  "--config",
  "vitest.integration.config.mts",
]);
