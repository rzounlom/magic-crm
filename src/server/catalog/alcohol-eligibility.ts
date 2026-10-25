import { audienceFromGuestMix } from "@/server/catalog/audience";
import { INQUIRY_AUDIENCES, type InquiryAudience } from "@/types/catalog";

export function containsAlcoholFromDeclarations(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  return (value as { containsAlcohol?: unknown }).containsAlcohol === true;
}

export function productContainsAlcohol(product: { containsAlcohol?: boolean | null }): boolean {
  return product.containsAlcohol === true;
}

/**
 * Alcohol is never an automatic dining recommendation.
 * Youth and mixed-age parties cannot receive it.
 * Adults receive it only when intake names that product slug.
 */
export function alcoholProductEligible(input: {
  audience: InquiryAudience;
  diningPreference: string | null | undefined;
  productSlug: string;
}): boolean {
  if (input.audience !== INQUIRY_AUDIENCES.ADULTS) {
    return false;
  }
  return (input.diningPreference?.trim() ?? "") === input.productSlug;
}

export function productEligibleForInquiry<T extends { slug: string; containsAlcohol?: boolean | null }>(
  product: T,
  input: {
    audience: InquiryAudience;
    diningPreference: string | null | undefined;
  },
): boolean {
  if (!productContainsAlcohol(product)) {
    return true;
  }
  return alcoholProductEligible({
    audience: input.audience,
    diningPreference: input.diningPreference,
    productSlug: product.slug,
  });
}

export function inquiryAudienceFromFacts(guestMix: string | null | undefined): InquiryAudience {
  return audienceFromGuestMix(guestMix);
}
