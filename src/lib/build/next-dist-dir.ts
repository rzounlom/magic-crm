/**
 * Pure Next.js distDir selection for MagicCRM.
 *
 * Local Scenario Lab (`pnpm scenario-lab:dev`) uses a separate directory so it
 * can run alongside normal `pnpm dev` without fighting the `.next` lock.
 * Vercel always uses the platform default (`.next`), even when the Lab
 * deployment kind is set — Vercel sets `VERCEL=1` during build and runtime.
 */

export const SCENARIO_LAB_LOCAL_DIST_DIR = ".next-scenario-lab";

/**
 * Returns a custom `distDir`, or `undefined` to keep Next.js default (`.next`).
 * Reads only process/build env — never request headers or client flags.
 */
export function resolveNextDistDir(source: NodeJS.Dict<string> = process.env): string | undefined {
  // Vercel documents `VERCEL=1` for builds and serverless runtimes.
  if (isTruthyVercel(source.VERCEL)) {
    return undefined;
  }

  if (source.MAGICCRM_DEPLOYMENT_KIND?.trim() === "scenario_lab_test") {
    return SCENARIO_LAB_LOCAL_DIST_DIR;
  }

  return undefined;
}

function isTruthyVercel(value: string | undefined): boolean {
  const trimmed = value?.trim();
  return trimmed === "1" || trimmed === "true";
}
