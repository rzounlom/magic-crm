export const BOOKING_STATUSES = {
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
} as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[keyof typeof BOOKING_STATUSES];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  [BOOKING_STATUSES.CONFIRMED]: "Confirmed",
  [BOOKING_STATUSES.CANCELLED]: "Cancelled",
  [BOOKING_STATUSES.COMPLETED]: "Completed",
};

export const BOOKING_LINE_ITEM_KINDS = {
  ACTIVITY: "ACTIVITY",
  DINING: "DINING",
  SPACE: "SPACE",
} as const;

export type BookingLineItemKind =
  (typeof BOOKING_LINE_ITEM_KINDS)[keyof typeof BOOKING_LINE_ITEM_KINDS];

export const BOOKING_LIST_FILTERS = {
  UPCOMING: "upcoming",
  TODAY: "today",
  WEEK: "week",
  PAST: "past",
} as const;

export type BookingListFilter = (typeof BOOKING_LIST_FILTERS)[keyof typeof BOOKING_LIST_FILTERS];
