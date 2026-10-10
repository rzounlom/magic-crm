import type { OperatingHoursEvaluationStatus } from "@/types/operating-hours";

export const CONFIRMATION_READINESS_STATES = {
  ALREADY_CONFIRMED: "ALREADY_CONFIRMED",
  CANCELLED: "CANCELLED",
  BLOCKED_DATA: "BLOCKED_DATA",
  BLOCKED_INVALID_LOCAL_TIME: "BLOCKED_INVALID_LOCAL_TIME",
  BLOCKED_HOURS_UNCONFIGURED: "BLOCKED_HOURS_UNCONFIGURED",
  BLOCKED_HOURS_UNVERIFIED: "BLOCKED_HOURS_UNVERIFIED",
  BLOCKED_OUTSIDE_HOURS: "BLOCKED_OUTSIDE_HOURS",
  BLOCKED_RESOURCE_CONFLICT: "BLOCKED_RESOURCE_CONFLICT",
  BLOCKED_INVENTORY: "BLOCKED_INVENTORY",
  NEEDS_FINAL_VALIDATION: "NEEDS_FINAL_VALIDATION",
  READY_WITH_EXCEPTION: "READY_WITH_EXCEPTION",
} as const;

export type ConfirmationReadinessState =
  (typeof CONFIRMATION_READINESS_STATES)[keyof typeof CONFIRMATION_READINESS_STATES];

export type ConfirmationReadinessBlocker = {
  code: string;
  message: string;
  overridableWithHoursException: boolean;
};

export type ConfirmationHoursExceptionSummary = {
  id: string;
  purpose: string;
  overriddenStatus: string;
  reason: string;
  expiresAt: string;
  authorizedAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  status: "ACTIVE" | "CONSUMED" | "REVOKED" | "EXPIRED";
};

export type ConfirmationReadinessResult = {
  inquiryId: string;
  bookingId: string | null;
  bookingNumber: string | null;
  bookingStatus: string | null;
  bookingHref: string | null;
  state: ConfirmationReadinessState;
  /** Honest label for staff; never claims a hard guarantee when final confirm must recheck. */
  headline: string;
  detail: string;
  locationId: string | null;
  locationName: string | null;
  timeZone: string;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  startMinute: number | null;
  endMinute: number | null;
  operatingHoursStatus: OperatingHoursEvaluationStatus | null;
  blockers: ConfirmationReadinessBlocker[];
  activeException: ConfirmationHoursExceptionSummary | null;
  canAuthorizeHoursException: boolean;
  canRevokeHoursException: boolean;
  canConfirmWithCurrentException: boolean;
  /** Confirm may be attempted; server still revalidates transactionally. */
  confirmAttemptAllowed: boolean;
};
