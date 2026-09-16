import { ATTRACTION_MODES, INQUIRY_AUDIENCES, type AttractionMode, type InquiryAudience } from "@/types/catalog";

export function audienceFromGuestMix(guestMix: string | null | undefined): InquiryAudience {
  if (guestMix === "mostly_adults") {
    return INQUIRY_AUDIENCES.ADULTS;
  }
  if (guestMix === "mostly_children" || guestMix === "teens") {
    return INQUIRY_AUDIENCES.KIDS_YOUTH;
  }
  return INQUIRY_AUDIENCES.MIXED;
}

export function attractionModeFromIntake(input: {
  attractionMode?: string | null;
  attractionInterestIds: string[];
}): AttractionMode {
  const raw = input.attractionMode?.trim().toUpperCase();
  if (raw === ATTRACTION_MODES.KNOWN || raw === "KNOWN") {
    return ATTRACTION_MODES.KNOWN;
  }
  if (raw === ATTRACTION_MODES.RECOMMEND || raw === "RECOMMEND") {
    return ATTRACTION_MODES.RECOMMEND;
  }
  return input.attractionInterestIds.length > 0 ? ATTRACTION_MODES.KNOWN : ATTRACTION_MODES.RECOMMEND;
}
