/**
 * Effortless Precision platform palette — single source for non-CSS consumers
 * (e.g. Clerk appearance). Feature UI must prefer CSS tokens / Tailwind utilities.
 *
 * CSS custom properties in `src/styles/tokens.css` remain the runtime source of truth
 * for application chrome. Keep hex values in sync when adjusting brand colors.
 */
export const BRAND_PALETTE = {
  navy: "#001C64",
  brandBlue: "#003087",
  action: "#0070E0",
  actionHover: "#005BB5",
  actionPressed: "#004A94",
  canvas: "#F5F7FB",
  surface: "#FFFFFF",
  ink: "#0B1220",
  inkMuted: "#5A6578",
  line: "#D5DEEA",
  lineSubtle: "#E8EEF6",
  mutedSurface: "#E8EEF5",
  success: "#1F7A4D",
  warning: "#9A6708",
  danger: "#B42318",
  info: "#0070E0",
  focusRing: "#0070E0",
  disabledFg: "#8A94A6",
  disabledBg: "#E8EEF5",
  primaryForeground: "#FFFFFF",
  accent: "#B8893A",
  radiusControl: "0.75rem",
} as const;

export type BrandPalette = typeof BRAND_PALETTE;
