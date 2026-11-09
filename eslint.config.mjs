import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-scenario-lab/**",
    ".pnpm-store/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    // Playwright artifacts (generated; not application source)
    "playwright-report/**",
    "test-results/**",
    // Local tool caches (micromamba PHP, parity export scratch)
    "tmp/**",
  ]),
]);

export default eslintConfig;
