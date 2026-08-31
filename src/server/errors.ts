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
