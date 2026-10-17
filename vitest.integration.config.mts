import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Temporary diagnostic probes; never part of the suite gate.
    exclude: ["tests/integration/_*.test.ts", "tests/integration/r1-*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    // Evidence (R1 latency probe on Neon TEST, 2026-10-10):
    // median SELECT 1 ≈ 108ms; cold ping up to ~429–627ms; provision 2 orgs ≈ 8s;
    // legacy cleanup was 41 sequential deleteMany (~4.7s warm, >10s cold) → afterEach hookTimeout.
    // Cleanup is now one SQL round-trip; timeouts stay above measured warm ops but still bound hangs.
    testTimeout: 45_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "server-only": path.resolve(rootDir, "./tests/mocks/server-only.ts"),
    },
  },
});
