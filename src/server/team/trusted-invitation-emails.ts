import { normalizeInvitationEmail } from "@/server/team/invitation-email";

export type ClerkEmailAddress = {
  emailAddress: string;
  verification?: { status?: string | null } | null;
};

export function verifiedEmailsFromClerkUser(user: {
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: readonly ClerkEmailAddress[];
}): string[] {
  const emails = new Set<string>();
  const primary = user.primaryEmailAddress?.emailAddress;
  if (primary) {
    const normalized = normalizeInvitationEmail(primary);
    if (normalized) {
      emails.add(normalized);
    }
  }

  for (const row of user.emailAddresses ?? []) {
    if (row.verification?.status !== "verified") {
      continue;
    }
    const normalized = normalizeInvitationEmail(row.emailAddress);
    if (normalized) {
      emails.add(normalized);
    }
  }

  return [...emails];
}
