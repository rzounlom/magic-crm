const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeInvitationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidInvitationEmail(value: string): boolean {
  const normalized = normalizeInvitationEmail(value);
  if (!normalized || normalized.length > EMAIL_MAX_LENGTH) {
    return false;
  }
  return EMAIL_PATTERN.test(normalized);
}

export function parseInvitationEmail(value: string): {
  email: string;
  emailNormalized: string;
} {
  const email = value.trim();
  const emailNormalized = normalizeInvitationEmail(value);
  if (!isValidInvitationEmail(email)) {
    throw new Error("INVALID_INVITATION_EMAIL");
  }
  return { email, emailNormalized };
}

export function emailsMatchNormalized(left: string | null | undefined, right: string): boolean {
  if (!left) {
    return false;
  }
  return normalizeInvitationEmail(left) === normalizeInvitationEmail(right);
}

export function hasPendingInvitationForEmail(
  invitations: ReadonlyArray<{ emailNormalized: string; status: string }>,
  emailNormalized: string,
): boolean {
  return invitations.some(
    (invitation) =>
      invitation.status === "PENDING" && invitation.emailNormalized === emailNormalized,
  );
}
