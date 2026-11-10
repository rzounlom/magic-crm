import { ONBOARDING_STATUSES } from "@/types/team";

const ACRONYMS = new Set(["ai", "crm", "pos", "faq"]);

export type OrganizationDisplayInput =
  | string
  | {
      name: string;
      customerFacingName?: string | null;
    };

/**
 * Customer-facing venue label for public pages and outbound copy.
 * Prefer explicit `customerFacingName` when set; otherwise keep real names as-is
 * and humanize slug-shaped internal names. Never invent a tenant brand globally.
 */
export function customerFacingOrganizationName(input: OrganizationDisplayInput): string {
  if (typeof input === "object" && input !== null) {
    const explicit = input.customerFacingName?.trim();
    if (explicit) {
      return explicit;
    }
    return humanizeStoredOrganizationName(input.name);
  }
  return humanizeStoredOrganizationName(input);
}

function humanizeStoredOrganizationName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Event host";
  }
  if (!looksLikeGeneratedSlug(trimmed)) {
    return trimmed;
  }

  const withoutTrailingId = trimmed.replace(/-\d{8,}$/, "");
  return withoutTrailingId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : capitalize(word)))
    .join(" ");
}

export function publicInquiryFormPath(organizationSlug: string): string {
  return `/inquire/${organizationSlug}`;
}

export function publicInquiryPathForActiveOrganization(
  organization: { slug: string; onboardingStatus: string } | null,
): string | null {
  const slug = organization?.slug.trim().toLowerCase() ?? "";
  if (!organization || !slug || organization.onboardingStatus !== ONBOARDING_STATUSES.ACTIVE) {
    return null;
  }
  return publicInquiryFormPath(slug);
}

function looksLikeGeneratedSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(value);
}

function capitalize(word: string): string {
  return word.slice(0, 1).toUpperCase() + word.slice(1);
}
