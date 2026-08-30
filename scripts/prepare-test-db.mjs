import { runWithTestEnv } from "./load-test-env.mjs";

runWithTestEnv("corepack", ["pnpm", "exec", "prisma", "migrate", "deploy"]);
