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
    // Scenario Lab dual-dev distDir (see next.config.ts)
    ".next-scenario-lab/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    // Playwright artifacts (generated; not application source)
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
