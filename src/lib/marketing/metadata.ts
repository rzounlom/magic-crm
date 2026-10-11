import type { Metadata } from "next";

const TITLE = "MagicCRM — Effortless event sales for entertainment venues";
const DESCRIPTION =
  "Turn every inquiry into something extraordinary. Capture event preferences, prepare personalized options, and coordinate booking workflows in one connected workspace.";

/** Canonical / OG absolute URLs only for a verified https production origin. */
export function marketingMetadata(): Metadata {
  const origin = verifiedMarketingOrigin();
  return {
    title: TITLE,
    description: DESCRIPTION,
    applicationName: "MagicCRM",
    robots: process.env.NODE_ENV === "production" ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      type: "website",
      siteName: "MagicCRM",
      ...(origin
        ? {
            url: origin,
            images: [{ url: `${origin}/marketing/og-card.png`, width: 1200, height: 630, alt: "MagicCRM customer event intake" }],
          }
        : {
            images: [{ url: "/marketing/og-card.png", alt: "MagicCRM customer event intake" }],
          }),
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE,
      description: DESCRIPTION,
      images: ["/marketing/og-card.png"],
    },
    ...(origin
      ? {
          metadataBase: new URL(origin),
          alternates: { canonical: "/" },
        }
      : {}),
  };
}

function verifiedMarketingOrigin(): string | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      return null;
    }
    if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
