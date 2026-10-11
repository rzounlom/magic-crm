import { BRAND_PALETTE } from "@/lib/ui/brand-palette";

/**
 * Clerk cannot read CSS custom properties for all appearance fields.
 * Values are centralized in `BRAND_PALETTE` and kept in sync with `tokens.css`.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: BRAND_PALETTE.action,
    colorBackground: BRAND_PALETTE.canvas,
    colorText: BRAND_PALETTE.ink,
    colorDanger: BRAND_PALETTE.danger,
    borderRadius: BRAND_PALETTE.radiusControl,
    fontFamily: "var(--font-source-sans), ui-sans-serif, system-ui, sans-serif",
  },
};
