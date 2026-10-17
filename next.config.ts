import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon", "@neondatabase/serverless"],
  // Disable the Next.js "N" indicator — it overlays the mobile primary nav
  // (Inquiries when bottom-left, More when bottom-right) and blocks Playwright taps.
  devIndicators: false,
};

export default nextConfig;
