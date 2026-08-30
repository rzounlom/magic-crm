export const TENANT_CONTEXT_ERROR_CODES = [
  "UNAUTHENTICATED",
  "NO_ACTIVE_ORGANIZATION",
  "ORGANIZATION_NOT_PROVISIONED",
  "USER_PROFILE_NOT_PROVISIONED",
  "INVALID_TENANT_MAPPING",
] as const;

export type TenantContextErrorCode = (typeof TENANT_CONTEXT_ERROR_CODES)[number];

const USER_MESSAGES: Record<TenantContextErrorCode, string> = {
  UNAUTHENTICATED: "Sign in to continue.",
  NO_ACTIVE_ORGANIZATION: "Choose or create an organization to continue.",
  ORGANIZATION_NOT_PROVISIONED: "This organization is not ready yet. Try again in a moment.",
  USER_PROFILE_NOT_PROVISIONED: "Your employee profile is not ready yet. Try again in a moment.",
  INVALID_TENANT_MAPPING: "We could not load this organization. Sign in again or choose another organization.",
};

export class TenantContextError extends Error {
  readonly code: TenantContextErrorCode;

  constructor(code: TenantContextErrorCode) {
    super(USER_MESSAGES[code]);
    this.name = "TenantContextError";
    this.code = code;
  }

  get userMessage(): string {
    return USER_MESSAGES[this.code];
  }
}

export function isTenantContextError(error: unknown): error is TenantContextError {
  return error instanceof TenantContextError;
}
