import { TeamManagementError, type TeamManagementErrorCode } from "@/server/errors";

type ClerkErrorItem = {
  code?: unknown;
  message?: unknown;
  longMessage?: unknown;
};

export const CLERK_INVITATION_FAILURES = {
  ALREADY_ORGANIZATION_MEMBER: "ALREADY_ORGANIZATION_MEMBER",
  INVITATION_ALREADY_PENDING: "INVITATION_ALREADY_PENDING",
  INVITATION_NOT_FOUND: "INVITATION_NOT_FOUND",
  INVITATION_NOT_PENDING: "INVITATION_NOT_PENDING",
  INVITATION_ALREADY_ACCEPTED: "INVITATION_ALREADY_ACCEPTED",
  INVITATION_ALREADY_REVOKED: "INVITATION_ALREADY_REVOKED",
  INVALID_INVITATION_EMAIL: "INVALID_INVITATION_EMAIL",
  ORGANIZATION_NOT_FOUND_OR_UNAUTHORIZED: "ORGANIZATION_NOT_FOUND_OR_UNAUTHORIZED",
  CLERK_UNAVAILABLE: "CLERK_UNAVAILABLE",
  UNKNOWN_CLERK_FAILURE: "UNKNOWN_CLERK_FAILURE",
} as const;

export type ClerkInvitationFailureClassification =
  (typeof CLERK_INVITATION_FAILURES)[keyof typeof CLERK_INVITATION_FAILURES];

export type ClassifiedClerkInvitationError = {
  classification: ClerkInvitationFailureClassification;
  clerkCodes: readonly string[];
  httpStatus: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function readClerkErrorCodes(error: unknown): string[] {
  const record = asRecord(error);
  if (!record || !Array.isArray(record.errors)) {
    return [];
  }

  return record.errors.flatMap((item) => {
    const entry = asRecord(item);
    return typeof entry?.code === "string" && entry.code.trim() ? [entry.code] : [];
  });
}

export function readClerkHttpStatus(error: unknown): number | null {
  const record = asRecord(error);
  return typeof record?.status === "number" ? record.status : null;
}

export function readClerkErrorText(error: unknown): string {
  const record = asRecord(error);
  const parts: string[] = [];
  if (typeof record?.message === "string") {
    parts.push(record.message);
  }
  if (Array.isArray(record?.errors)) {
    for (const item of record.errors) {
      const entry = asRecord(item) as ClerkErrorItem | null;
      if (typeof entry?.longMessage === "string") {
        parts.push(entry.longMessage);
      }
      if (typeof entry?.message === "string") {
        parts.push(entry.message);
      }
    }
  }
  return parts.join(" ").toLowerCase();
}

export function isClerkNotFoundError(error: unknown): boolean {
  const status = readClerkHttpStatus(error);
  const codes = readClerkErrorCodes(error);
  if (codes.includes("organization_invitation_not_pending")) {
    return false;
  }
  if (status === 404) {
    return true;
  }
  return codes.includes("resource_not_found");
}

export function classifyClerkInvitationError(error: unknown): ClassifiedClerkInvitationError {
  const clerkCodes = readClerkErrorCodes(error);
  const codes = new Set(clerkCodes);
  const status = readClerkHttpStatus(error);
  const text = readClerkErrorText(error);

  if (
    codes.has("already_a_member_in_organization") ||
    text.includes("already a member of the organization") ||
    text.includes("already a member")
  ) {
    return { classification: CLERK_INVITATION_FAILURES.ALREADY_ORGANIZATION_MEMBER, clerkCodes, httpStatus: status };
  }

  if (
    codes.has("duplicate_record") ||
    codes.has("organization_invitation_not_unique") ||
    text.includes("already been invited") ||
    text.includes("pending invitation") ||
    text.includes("already invited") ||
    text.includes("duplicate pending invitations")
  ) {
    return { classification: CLERK_INVITATION_FAILURES.INVITATION_ALREADY_PENDING, clerkCodes, httpStatus: status };
  }

  if (codes.has("form_identifier_invalid") || codes.has("form_param_format_invalid")) {
    return { classification: CLERK_INVITATION_FAILURES.INVALID_INVITATION_EMAIL, clerkCodes, httpStatus: status };
  }

  if (codes.has("invitation_already_accepted")) {
    return { classification: CLERK_INVITATION_FAILURES.INVITATION_ALREADY_ACCEPTED, clerkCodes, httpStatus: status };
  }

  if (codes.has("invitation_already_revoked")) {
    return { classification: CLERK_INVITATION_FAILURES.INVITATION_ALREADY_REVOKED, clerkCodes, httpStatus: status };
  }

  if (codes.has("organization_invitation_not_pending") || text.includes("not in the \"pending\" status") || text.includes("not pending")) {
    return { classification: CLERK_INVITATION_FAILURES.INVITATION_NOT_PENDING, clerkCodes, httpStatus: status };
  }

  if (
    codes.has("missing_organization_permission") ||
    codes.has("not_authorized") ||
    status === 401 ||
    status === 403
  ) {
    return {
      classification: CLERK_INVITATION_FAILURES.ORGANIZATION_NOT_FOUND_OR_UNAUTHORIZED,
      clerkCodes,
      httpStatus: status,
    };
  }

  if (isClerkNotFoundError(error)) {
    return { classification: CLERK_INVITATION_FAILURES.INVITATION_NOT_FOUND, clerkCodes, httpStatus: status };
  }

  if (status === 429 || (status !== null && status >= 500) || codes.has("internal_clerk_error")) {
    return { classification: CLERK_INVITATION_FAILURES.CLERK_UNAVAILABLE, clerkCodes, httpStatus: status };
  }

  return { classification: CLERK_INVITATION_FAILURES.UNKNOWN_CLERK_FAILURE, clerkCodes, httpStatus: status };
}

const CLASSIFICATION_TO_TEAM_CODE: Record<ClerkInvitationFailureClassification, TeamManagementErrorCode> = {
  ALREADY_ORGANIZATION_MEMBER: "ALREADY_ORGANIZATION_MEMBER",
  INVITATION_ALREADY_PENDING: "INVITATION_ALREADY_PENDING",
  INVITATION_NOT_FOUND: "INVITATION_NOT_FOUND",
  INVITATION_NOT_PENDING: "INVITATION_NOT_PENDING",
  INVITATION_ALREADY_ACCEPTED: "INVITATION_ALREADY_ACCEPTED",
  INVITATION_ALREADY_REVOKED: "INVITATION_ALREADY_REVOKED",
  INVALID_INVITATION_EMAIL: "INVALID_INVITATION_EMAIL",
  ORGANIZATION_NOT_FOUND_OR_UNAUTHORIZED: "ORGANIZATION_NOT_FOUND_OR_UNAUTHORIZED",
  CLERK_UNAVAILABLE: "CLERK_UNAVAILABLE",
  UNKNOWN_CLERK_FAILURE: "CLERK_INVITATION_FAILED",
};

export function mapClerkInvitationError(
  error: unknown,
  operation: "send" | "revoke" = "send",
): TeamManagementError {
  const classified = classifyClerkInvitationError(error);
  if (classified.classification === CLERK_INVITATION_FAILURES.UNKNOWN_CLERK_FAILURE) {
    return new TeamManagementError(operation === "revoke" ? "CLERK_REVOKE_FAILED" : "CLERK_INVITATION_FAILED");
  }
  return new TeamManagementError(CLASSIFICATION_TO_TEAM_CODE[classified.classification]);
}

export function isInactiveClerkInvitationClassification(
  classification: ClerkInvitationFailureClassification,
): boolean {
  return (
    classification === CLERK_INVITATION_FAILURES.INVITATION_NOT_FOUND ||
    classification === CLERK_INVITATION_FAILURES.INVITATION_NOT_PENDING ||
    classification === CLERK_INVITATION_FAILURES.INVITATION_ALREADY_ACCEPTED ||
    classification === CLERK_INVITATION_FAILURES.INVITATION_ALREADY_REVOKED
  );
}
