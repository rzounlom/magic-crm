export const RESOURCE_SCHEDULING_MODES = {
  SLOTTED: "SLOTTED",
  CONTINUOUS: "CONTINUOUS",
} as const;

export type ResourceSchedulingMode =
  (typeof RESOURCE_SCHEDULING_MODES)[keyof typeof RESOURCE_SCHEDULING_MODES];

export const RESOURCE_QUANTITY_RULES = {
  FIXED: "FIXED",
  PER_GUESTS: "PER_GUESTS",
  UNKNOWN: "UNKNOWN",
} as const;

export type ResourceQuantityRule =
  (typeof RESOURCE_QUANTITY_RULES)[keyof typeof RESOURCE_QUANTITY_RULES];

export const RESOURCE_RESERVATION_STATUSES = {
  HOLD: "HOLD",
  BOOKED: "BOOKED",
} as const;

export type ResourceReservationStatus =
  (typeof RESOURCE_RESERVATION_STATUSES)[keyof typeof RESOURCE_RESERVATION_STATUSES];

export const RESOURCE_RESERVATION_SOURCES = {
  INQUIRY: "INQUIRY",
  BOOKING: "BOOKING",
  MANUAL: "MANUAL",
} as const;

export type ResourceReservationSource =
  (typeof RESOURCE_RESERVATION_SOURCES)[keyof typeof RESOURCE_RESERVATION_SOURCES];

export const PLAN_AVAILABILITY_STATUSES = {
  NOT_VALIDATED: "NOT_VALIDATED",
  AVAILABLE: "AVAILABLE",
  NEEDS_ADJUSTMENT: "NEEDS_ADJUSTMENT",
  AVAILABILITY_CHANGED: "AVAILABILITY_CHANGED",
} as const;

export type PlanAvailabilityStatus =
  (typeof PLAN_AVAILABILITY_STATUSES)[keyof typeof PLAN_AVAILABILITY_STATUSES];

export const PLAN_AVAILABILITY_STATUS_LABELS: Record<PlanAvailabilityStatus, string> = {
  [PLAN_AVAILABILITY_STATUSES.NOT_VALIDATED]: "Not validated",
  [PLAN_AVAILABILITY_STATUSES.AVAILABLE]: "Available",
  [PLAN_AVAILABILITY_STATUSES.NEEDS_ADJUSTMENT]: "Needs adjustment",
  [PLAN_AVAILABILITY_STATUSES.AVAILABILITY_CHANGED]: "Availability changed",
};

export const DEFAULT_HOLD_HOURS = 24;
export const MAX_BULK_RESOURCES = 40;
export const SCHEDULE_DAY_START_MINUTE = 8 * 60;
export const SCHEDULE_DAY_END_MINUTE = 22 * 60;
export const SCHEDULE_SLOT_MINUTES = 30;

export type PlanResourceRequirement = {
  knowledgeItemId: string;
  knowledgeItemName: string;
  resourceTypeId: string | null;
  resourceTypeSlug: string;
  resourceTypeName: string;
  quantityRule: ResourceQuantityRule;
  quantity: number | null;
  guestBasedQuantity?: number | null;
  guestsPerUnit: number | null;
  durationMinutes: number | null;
  inventoryConfigured: boolean;
  requiresStaffConfiguration: boolean;
  rotationWaves?: number | null;
  rotationNote?: string | null;
};

export type ResourceAvailabilityRequest = {
  organizationId: string;
  date: string | null;
  startTime: string | null;
  durationMinutes: number;
  resourceRequirements: PlanResourceRequirement[];
  excludeInquiryId?: string | null;
  excludeBookingId?: string | null;
  excludeReservationId?: string | null;
};

export type ResourceTypeAvailability = {
  resourceTypeSlug: string;
  resourceTypeName: string;
  requestedQuantity: number | null;
  availableQuantity: number | null;
  inventoryConfigured: boolean;
  conflict: boolean;
  requiresStaffConfiguration: boolean;
};

export type ResourceAvailabilityResult = {
  /** True only when every finite requirement has configured inventory and no HOLD/BOOKED conflict. */
  validated: boolean;
  available: boolean;
  note: string;
  types: ResourceTypeAvailability[];
};
