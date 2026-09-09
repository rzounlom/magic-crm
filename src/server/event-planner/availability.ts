import type { EventPlanActivity, EventPlanSpace } from "@/types/event-planner";
import type { PlanResourceRequirement } from "@/types/resource-schedule";

export type AvailabilityCheckInput = {
  eventDate: string | null;
  startTime: string | null;
  durationMinutes: number;
  guestCount: number;
  activities: EventPlanActivity[];
  spaces: EventPlanSpace[];
  resourceRequirements?: PlanResourceRequirement[];
  excludeInquiryId?: string | null;
  excludeBookingId?: string | null;
};

export type AvailabilityCheckResult = {
  validated: boolean;
  available?: boolean;
  note?: string;
  types?: import("@/types/resource-schedule").ResourceTypeAvailability[];
};

export type PlanAvailabilityProvider = {
  check(input: AvailabilityCheckInput): AvailabilityCheckResult | Promise<AvailabilityCheckResult>;
};

export const STATIC_AVAILABILITY_NOTE =
  "Known published limits were applied. Live inventory still needs confirmation.";

export async function applyAvailabilityProvider(
  input: AvailabilityCheckInput,
  provider?: PlanAvailabilityProvider,
): Promise<AvailabilityCheckResult> {
  if (!provider) {
    return { validated: false };
  }
  return provider.check(input);
}
