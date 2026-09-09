export const TENANT_CONTEXT_ERROR_CODES = [
  "UNAUTHENTICATED",
  "NO_ACTIVE_ORGANIZATION",
  "ORGANIZATION_NOT_PROVISIONED",
  "USER_PROFILE_NOT_PROVISIONED",
  "INVALID_TENANT_MAPPING",
] as const;

export type TenantContextErrorCode = (typeof TENANT_CONTEXT_ERROR_CODES)[number];

const TENANT_USER_MESSAGES: Record<TenantContextErrorCode, string> = {
  UNAUTHENTICATED: "Sign in to continue.",
  NO_ACTIVE_ORGANIZATION: "Choose an organization to continue.",
  ORGANIZATION_NOT_PROVISIONED: "This organization is not ready yet. Try again in a moment.",
  USER_PROFILE_NOT_PROVISIONED: "Your employee profile is not ready yet. Try again in a moment.",
  INVALID_TENANT_MAPPING: "We could not load this organization. Sign in again or choose another organization.",
};

export class TenantContextError extends Error {
  readonly code: TenantContextErrorCode;

  constructor(code: TenantContextErrorCode) {
    super(TENANT_USER_MESSAGES[code]);
    this.name = "TenantContextError";
    this.code = code;
  }

  get userMessage(): string {
    return TENANT_USER_MESSAGES[this.code];
  }
}

export function isTenantContextError(error: unknown): error is TenantContextError {
  return error instanceof TenantContextError;
}

export const AUTHORIZATION_ERROR_CODES = [
  "FORBIDDEN",
  "LAST_ADMIN_REQUIRED",
  "SYSTEM_GROUP_PROTECTED",
  "CROSS_TENANT_ASSIGNMENT",
  "DUPLICATE_GROUP_NAME",
] as const;

export type AuthorizationErrorCode = (typeof AUTHORIZATION_ERROR_CODES)[number];

const AUTHORIZATION_USER_MESSAGES: Record<AuthorizationErrorCode, string> = {
  FORBIDDEN: "You don't have permission to perform this action.",
  LAST_ADMIN_REQUIRED: "At least one administrator must remain.",
  SYSTEM_GROUP_PROTECTED: "This security group is protected and cannot be changed that way.",
  CROSS_TENANT_ASSIGNMENT: "That employee does not belong to this organization.",
  DUPLICATE_GROUP_NAME: "A security group with that name already exists.",
};

export class AuthorizationError extends Error {
  readonly code: AuthorizationErrorCode;

  constructor(code: AuthorizationErrorCode) {
    super(AUTHORIZATION_USER_MESSAGES[code]);
    this.name = "AuthorizationError";
    this.code = code;
  }

  get userMessage(): string {
    return AUTHORIZATION_USER_MESSAGES[this.code];
  }
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}

export const TEAM_MANAGEMENT_ERROR_CODES = [
  "INVITATION_ALREADY_PENDING",
  "ALREADY_ORGANIZATION_MEMBER",
  "INVITATION_NOT_PENDING",
  "INVITATION_NOT_FOUND",
  "INVITATION_ALREADY_ACCEPTED",
  "INVITATION_ALREADY_REVOKED",
  "INVALID_INVITATION_EMAIL",
  "ADMINISTRATORS_ASSIGNMENT_FORBIDDEN",
  "QUEUED_GROUP_NOT_IN_TENANT",
  "ORGANIZATION_NOT_FOUND_OR_UNAUTHORIZED",
  "CLERK_UNAVAILABLE",
  "CLERK_INVITATION_FAILED",
  "CLERK_REVOKE_FAILED",
  "CLIENT_TENANT_VALIDATION",
] as const;

export type TeamManagementErrorCode = (typeof TEAM_MANAGEMENT_ERROR_CODES)[number];

const TEAM_USER_MESSAGES: Record<TeamManagementErrorCode, string> = {
  INVITATION_ALREADY_PENDING: "There is already an active invitation for this email.",
  ALREADY_ORGANIZATION_MEMBER: "This person is already a member of this organization.",
  INVITATION_NOT_PENDING: "That invitation is no longer pending.",
  INVITATION_NOT_FOUND: "That invitation is no longer pending.",
  INVITATION_ALREADY_ACCEPTED: "That invitation is no longer pending.",
  INVITATION_ALREADY_REVOKED: "That invitation is no longer pending.",
  INVALID_INVITATION_EMAIL: "Enter a valid email address.",
  ADMINISTRATORS_ASSIGNMENT_FORBIDDEN: "Only an administrator can assign the Administrators group.",
  QUEUED_GROUP_NOT_IN_TENANT: "That security group is not in this organization.",
  ORGANIZATION_NOT_FOUND_OR_UNAUTHORIZED: "We could not update that invitation. Try again.",
  CLERK_UNAVAILABLE: "The invitation service is temporarily unavailable. Try again.",
  CLERK_INVITATION_FAILED: "A new invitation could not be sent. Please try again.",
  CLERK_REVOKE_FAILED: "The invitation could not be revoked. Please try again.",
  CLIENT_TENANT_VALIDATION: "Check the organization name, admin email, timezone, and currency.",
};

export class TeamManagementError extends Error {
  readonly code: TeamManagementErrorCode;

  constructor(code: TeamManagementErrorCode, message?: string) {
    super(message ?? TEAM_USER_MESSAGES[code]);
    this.name = "TeamManagementError";
    this.code = code;
  }

  get userMessage(): string {
    return this.message;
  }
}

export function isTeamManagementError(error: unknown): error is TeamManagementError {
  return error instanceof TeamManagementError;
}

export const INQUIRY_ERROR_CODES = [
  "INVALID_INTAKE",
  "TENANT_NOT_AVAILABLE",
  "CONVERSATION_NOT_FOUND",
  "RATE_LIMITED",
  "DUPLICATE_SUBMISSION",
  "AI_DISABLED",
  "INVALID_KNOWLEDGE",
  "PLAN_NOT_FOUND",
  "WORKING_PLAN_INVALID",
  "STALE_INQUIRY",
  "INQUIRY_ALREADY_BOOKED",
] as const;

export type InquiryErrorCode = (typeof INQUIRY_ERROR_CODES)[number];

const INQUIRY_USER_MESSAGES: Record<InquiryErrorCode, string> = {
  INVALID_INTAKE: "Check the form and try again.",
  TENANT_NOT_AVAILABLE: "This inquiry page is not available.",
  CONVERSATION_NOT_FOUND: "We could not find that conversation.",
  RATE_LIMITED: "Please wait a moment before sending another message.",
  DUPLICATE_SUBMISSION: "That message was already received.",
  AI_DISABLED: "A team member will continue this conversation.",
  INVALID_KNOWLEDGE: "Check the knowledge item and try again.",
  PLAN_NOT_FOUND: "We could not find that event plan.",
  WORKING_PLAN_INVALID: "Check the working event plan and try again.",
  STALE_INQUIRY: "This inquiry was updated by someone else. Refresh and try again.",
  INQUIRY_ALREADY_BOOKED: "This event plan has already been finalized.",
};

export class InquiryError extends Error {
  readonly code: InquiryErrorCode;

  constructor(code: InquiryErrorCode, message?: string) {
    super(message ?? INQUIRY_USER_MESSAGES[code]);
    this.name = "InquiryError";
    this.code = code;
  }

  get userMessage(): string {
    return this.message;
  }
}

export function isInquiryError(error: unknown): error is InquiryError {
  return error instanceof InquiryError;
}

export const RESOURCE_ERROR_CODES = [
  "INVALID_RESOURCE",
  "RESOURCE_NOT_FOUND",
  "RESOURCE_CONFLICT",
  "HOLD_NOT_FOUND",
  "BOOKED_CANNOT_RELEASE",
] as const;

export type ResourceErrorCode = (typeof RESOURCE_ERROR_CODES)[number];

const RESOURCE_USER_MESSAGES: Record<ResourceErrorCode, string> = {
  INVALID_RESOURCE: "Check the resource details and try again.",
  RESOURCE_NOT_FOUND: "That resource could not be found.",
  RESOURCE_CONFLICT:
    "That resource is no longer available for the selected time. Please choose another resource or time.",
  HOLD_NOT_FOUND: "That hold is no longer active.",
  BOOKED_CANNOT_RELEASE: "Confirmed bookings cannot be released from this action.",
};

export class ResourceError extends Error {
  readonly code: ResourceErrorCode;

  constructor(code: ResourceErrorCode, message?: string) {
    super(message ?? RESOURCE_USER_MESSAGES[code]);
    this.name = "ResourceError";
    this.code = code;
  }

  get userMessage(): string {
    return this.message;
  }
}

export function isResourceError(error: unknown): error is ResourceError {
  return error instanceof ResourceError;
}

export const BOOKING_ERROR_CODES = [
  "NOT_READY_TO_FINALIZE",
  "HOLD_MISSING",
  "HOLD_EXPIRED",
  "HOLD_MISMATCH",
  "ALREADY_BOOKED",
  "BOOKING_NOT_FOUND",
  "AVAILABILITY_CONFLICT",
] as const;

export type BookingErrorCode = (typeof BOOKING_ERROR_CODES)[number];

const BOOKING_USER_MESSAGES: Record<BookingErrorCode, string> = {
  NOT_READY_TO_FINALIZE: "Mark this inquiry Ready to Finalize before confirming a booking.",
  HOLD_MISSING: "Place a resource hold for every required finite resource before confirming.",
  HOLD_EXPIRED: "A resource hold has expired. Recheck availability and place a new hold.",
  HOLD_MISMATCH: "The current resource holds do not match the working event plan. Update the hold first.",
  ALREADY_BOOKED: "This inquiry has already been converted to a booking.",
  BOOKING_NOT_FOUND: "That booking could not be found.",
  AVAILABILITY_CONFLICT: "Required resources are no longer available. Recheck the Master Schedule.",
};

export class BookingError extends Error {
  readonly code: BookingErrorCode;

  constructor(code: BookingErrorCode, message?: string) {
    super(message ?? BOOKING_USER_MESSAGES[code]);
    this.name = "BookingError";
    this.code = code;
  }

  get userMessage(): string {
    return this.message;
  }
}

export function isBookingError(error: unknown): error is BookingError {
  return error instanceof BookingError;
}
