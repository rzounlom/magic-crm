import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BRAND_PALETTE } from "@/lib/ui/brand-palette";

/** Relative luminance for sRGB hex (#RRGGBB). */
function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const n = Number.parseInt(raw, 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = luminance(foreground);
  const l2 = luminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("UX2 brand contrast (WCAG 2.2 AA reference)", () => {
  const tokens = readFileSync(path.join(process.cwd(), "src/styles/tokens.css"), "utf8");

  it("keeps Effortless Precision hex values aligned with tokens", () => {
    const lower = tokens.toLowerCase();
    expect(lower).toContain(BRAND_PALETTE.action.toLowerCase());
    expect(lower).toContain(BRAND_PALETTE.navy.toLowerCase());
    expect(tokens).toContain("--canvas-50:");
    expect(tokens).toContain("--ink-900:");
    expect(tokens).toContain("--ink-600:");
  });

  it("meets AA contrast for primary body and control combinations", () => {
    const pairs: Array<{ name: string; fg: string; bg: string; min: number }> = [
      { name: "ink on canvas", fg: BRAND_PALETTE.ink, bg: BRAND_PALETTE.canvas, min: 4.5 },
      { name: "ink on surface", fg: BRAND_PALETTE.ink, bg: BRAND_PALETTE.surface, min: 4.5 },
      { name: "muted on canvas", fg: BRAND_PALETTE.inkMuted, bg: BRAND_PALETTE.canvas, min: 4.5 },
      { name: "muted on surface", fg: BRAND_PALETTE.inkMuted, bg: BRAND_PALETTE.surface, min: 4.5 },
      { name: "white on action (button label)", fg: BRAND_PALETTE.primaryForeground, bg: BRAND_PALETTE.action, min: 4.5 },
      { name: "action on white (link/UI)", fg: BRAND_PALETTE.action, bg: BRAND_PALETTE.surface, min: 4.5 },
      { name: "action on canvas (link/UI)", fg: BRAND_PALETTE.action, bg: BRAND_PALETTE.canvas, min: 4.5 },
      { name: "success on white", fg: BRAND_PALETTE.success, bg: BRAND_PALETTE.surface, min: 4.5 },
      { name: "warning on white", fg: BRAND_PALETTE.warning, bg: BRAND_PALETTE.surface, min: 4.5 },
      { name: "danger on white", fg: BRAND_PALETTE.danger, bg: BRAND_PALETTE.surface, min: 4.5 },
    ];

    for (const pair of pairs) {
      const ratio = Number(contrastRatio(pair.fg, pair.bg).toFixed(2));
      expect(ratio, `${pair.name} ${ratio}:1`).toBeGreaterThanOrEqual(pair.min);
    }
  });

  it("documents disabled presentation as non-essential text", () => {
    // Disabled controls are exempt from AA normal-text for inactive UI; still keep readable.
    const ratio = contrastRatio(BRAND_PALETTE.disabledFg, BRAND_PALETTE.disabledBg);
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(4.5); // intentionally softer than body text
  });
});
