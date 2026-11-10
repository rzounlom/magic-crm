import {
  readEmployeeApprovedQuoteMarker,
  readWpQuoteDraftProvenance,
} from "@/server/event-planner/wp-parity";
import {
  WP_EXCLUSIVE_ROOM_MAPPINGS,
  wpAttractionsRequiringInventoryForBooking,
  wpExclusiveRoomsRequiringInventoryForBooking,
} from "@/server/event-planner/wp-parity/inventory-mapping";
import type { AttractionKey } from "@/server/event-planner/wp-parity/types";
import { INQUIRY_STATUSES } from "@/types/inquiry";
import type { EventPlanPayload } from "@/types/event-planner";

const ATTRACTION_KEYS = new Set<AttractionKey>([
  "bowling",
  "axe",
  "laser",
  "golf",
  "climbing",
  "arcade",
]);

/**
 * Block booking confirmation for employee-approved WP quotes when reservable
 * attractions or exclusive rooms lack mapped MagiCRM resource requirements.
 */
export function wpApprovedQuoteInventoryBlockers(payload: EventPlanPayload): string[] {
  const marker = readEmployeeApprovedQuoteMarker(payload);
  const provenance = readWpQuoteDraftProvenance(payload);
  if (!marker && !provenance) {
    return [];
  }
  const selected: AttractionKey[] =
    provenance?.selectedAttractions ??
    payload.activities
      .map((row) => row.name.toLowerCase())
      .filter((name): name is AttractionKey => ATTRACTION_KEYS.has(name as AttractionKey));
  const requiredAttractions = wpAttractionsRequiringInventoryForBooking(selected);
  const requiredRooms = wpExclusiveRoomsRequiringInventoryForBooking(
    provenance?.exclusiveRooms ?? [],
  );
  if (requiredAttractions.length === 0 && requiredRooms.length === 0) {
    return [];
  }
  const mappedKeys = new Set(
    (payload.resourceRequirements ?? [])
      .filter((row) => row.resourceTypeId && (row.quantity ?? 0) > 0)
      .map((row) => row.knowledgeItemId.replace(/^wp:/, "")),
  );
  const mappedTypeIds = new Set(
    (payload.resourceRequirements ?? [])
      .map((row) => row.resourceTypeId)
      .filter((id): id is string => Boolean(id)),
  );
  const mappedSlugs = new Set(
    (payload.resourceRequirements ?? [])
      .map((row) => row.resourceTypeSlug)
      .filter((slug): slug is string => Boolean(slug)),
  );
  const missingAttractions = requiredAttractions.filter((attraction) => !mappedKeys.has(attraction));
  const missingRooms = requiredRooms.filter((room) => {
    if (mappedKeys.has(`room:${room}`)) {
      return false;
    }
    // Cove may already be covered by climbing attraction → climbing-area.
    const mapping = WP_EXCLUSIVE_ROOM_MAPPINGS.find((row) => row.key === room);
    return !mapping?.resourceTypeSlugs.some((slug) => mappedSlugs.has(slug));
  });
  void mappedTypeIds;
  const blockers: string[] = [];
  if (missingAttractions.length > 0) {
    blockers.push(
      `Cannot confirm booking: reservable WordPress attractions are not mapped to MagiCRM inventory (${missingAttractions.join(", ")}). Configure resource types or remove those attractions before confirming.`,
    );
  }
  if (missingRooms.length > 0) {
    blockers.push(
      `Cannot confirm booking: exclusive WordPress rooms are not mapped to MagiCRM inventory (${missingRooms.join(", ")}). Configure resource types before confirming.`,
    );
  }
  return blockers;
}

export type BookingHoldSnapshot = {
  status: string;
  expiresAt: Date | null;
  releasedAt: Date | null;
  startMinute: number;
  endMinute: number;
  resource: {
    resourceType: { id: string; name: string };
  };
};

export function bookingConfirmationBlockers(
  input: {
    inquiryStatus: string;
    workflowStage: string | null;
    readyToFinalizeAt: Date | null;
    selectedEventPlanId: string | null;
    assignedUserProfileId: string | null;
    workingPlan: {
      availabilityStatus: string | null;
      estimatedTotalCents: number | null;
      payload: EventPlanPayload;
    } | null;
    holds: BookingHoldSnapshot[];
    hasFiniteRequirements: boolean;
  },
  now = new Date(),
): string[] {
  const blockers: string[] = [];
  if (input.inquiryStatus === INQUIRY_STATUSES.BOOKED) {
    return blockers;
  }
  if (!input.selectedEventPlanId) {
    blockers.push("This inquiry does not have a customer-selected plan.");
  }
  if (!input.workingPlan && !input.selectedEventPlanId) {
    blockers.push("Select or save a proposal before confirming.");
  }
  const payload = input.workingPlan?.payload;
  if (payload && !payload.eventDate) {
    blockers.push("Choose an event date on the Current Agent Version.");
  }
  if (payload && !payload.startTime) {
    blockers.push("Choose a start time on the Current Agent Version.");
  }
  if (payload && (!payload.guestCount || payload.guestCount < 1)) {
    blockers.push("Enter a valid guest count.");
  }
  if (payload && payload.durationMinutes < 30) {
    blockers.push("Event duration must be at least 30 minutes.");
  }
  if (input.workingPlan && (input.workingPlan.estimatedTotalCents == null || input.workingPlan.estimatedTotalCents < 0)) {
    blockers.push("Pricing could not be calculated from sales knowledge.");
  }
  if (payload) {
    blockers.push(...wpApprovedQuoteInventoryBlockers(payload));
  }
  void input.hasFiniteRequirements;
  void input.holds;
  void now;
  return blockers;
}
