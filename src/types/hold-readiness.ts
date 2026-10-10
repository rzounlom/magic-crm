import type { OperatingHoursEvaluationStatus } from "@/types/operating-hours";

export const HOLD_READINESS_STATES = {
  ALREADY_BOOKED: "ALREADY_BOOKED",
  ALREADY_HELD: "ALREADY_HELD",
  BLOCKED_DATA: "BLOCKED_DATA",
  BLOCKED_INVALID_LOCAL_TIME: "BLOCKED_INVALID_LOCAL_TIME",
  BLOCKED_HOURS_UNCONFIGURED: "BLOCKED_HOURS_UNCONFIGURED",
  BLOCKED_HOURS_UNVERIFIED: "BLOCKED_HOURS_UNVERIFIED",
  BLOCKED_OUTSIDE_HOURS: "BLOCKED_OUTSIDE_HOURS",
  BLOCKED_RESOURCE_CONFLICT: "BLOCKED_RESOURCE_CONFLICT",
  BLOCKED_INVENTORY: "BLOCKED_INVENTORY",
  BLOCKED_NO_RESOURCES: "BLOCKED_NO_RESOURCES",
  NEEDS_FINAL_VALIDATION: "NEEDS_FINAL_VALIDATION",
  READY_WITH_EXCEPTION: "READY_WITH_EXCEPTION",
} as const;

export type HoldReadinessState =
  (typeof HOLD_READINESS_STATES)[keyof typeof HOLD_READINESS_STATES];

export type HoldReadinessBlocker = {
  code: string;
  message: string;
  overridableWithHoursException: boolean;
};

export type HoldHoursExceptionSummary = {
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

export type HoldActiveSummary = {
  resourceCount: number;
  resourceLabels: string[];
  expiresAt: string | null;
  expired: boolean;
};

export type HoldReadinessResult = {
  inquiryId: string;
  state: HoldReadinessState;
  /** Honest label for staff; never claims a hard guarantee when final HOLD must recheck. */
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
  blockers: HoldReadinessBlocker[];
  activeException: HoldHoursExceptionSummary | null;
  activeHold: HoldActiveSummary | null;
  resourceAssignments: Array<{
    resourceTypeName: string;
    quantity: number | null;
    windowLabel: string | null;
  }>;
  canAuthorizeHoursException: boolean;
  canRevokeHoursException: boolean;
  canHoldWithCurrentException: boolean;
  /** HOLD may be attempted; server still revalidates transactionally. */
  holdAttemptAllowed: boolean;
};
