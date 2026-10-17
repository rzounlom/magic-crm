import type { NextConfig } from "next";

/**
 * Scenario Lab local browser runs use a separate distDir so `pnpm scenario-lab:dev`
 * can listen on :3010 without colliding with the normal `pnpm dev` lock under `.next`.
 */
const scenarioLabDistDir =
  process.env.MAGICCRM_DEPLOYMENT_KIND === "scenario_lab_test" ? ".next-scenario-lab" : undefined;

const nextConfig: NextConfig = {
  ...(scenarioLabDistDir ? { distDir: scenarioLabDistDir } : {}),
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon", "@neondatabase/serverless"],
  // Disable the Next.js "N" indicator — it overlays the mobile primary nav
  // (Inquiries when bottom-left, More when bottom-right) and blocks Playwright taps.
  devIndicators: false,
};

export default nextConfig;
