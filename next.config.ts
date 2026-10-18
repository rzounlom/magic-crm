import type { NextConfig } from "next";

import { resolveNextDistDir } from "./src/lib/build/next-dist-dir";

/**
 * Scenario Lab local browser runs use a separate distDir so `pnpm scenario-lab:dev`
 * can listen on :3010 without colliding with the normal `pnpm dev` lock under `.next`.
 * On Vercel (`VERCEL=1`), always use the default `.next` output — even when
 * MAGICCRM_DEPLOYMENT_KIND=scenario_lab_test.
 */
const scenarioLabDistDir = resolveNextDistDir(process.env);

const nextConfig: NextConfig = {
  ...(scenarioLabDistDir ? { distDir: scenarioLabDistDir } : {}),
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon", "@neondatabase/serverless"],
  // Disable the Next.js "N" indicator — it overlays the mobile primary nav
  // (Inquiries when bottom-left, More when bottom-right) and blocks Playwright taps.
  devIndicators: false,
};

export default nextConfig;
