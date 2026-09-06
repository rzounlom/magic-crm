/**
 * Narrow Clerk Organization management used for invitations and platform
 * client bootstrap. Production uses Clerk's Backend Organization API.
 * Tests inject a fake. This adapter is never tenant authority — callers must
 * pass clerkOrganizationId from trusted RequestContext or platform CLI state.
 */

export const CLERK_ORGANIZATION_INVITATION_STATUSES = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REVOKED: "revoked",
  EXPIRED: "expired",
} as const;

export type ClerkOrganizationInvitationStatus =
  (typeof CLERK_ORGANIZATION_INVITATION_STATUSES)[keyof typeof CLERK_ORGANIZATION_INVITATION_STATUSES];

export type OrganizationInvitationRecord = {
  id: string;
  emailAddress: string;
  clerkOrganizationId: string;
  expiresAt: Date | null;
  status: ClerkOrganizationInvitationStatus | null;
};

export type OrganizationMembershipRecord = {
  clerkUserId: string;
  emailAddresses: readonly string[];
};

export type ClerkOrganizationRecord = {
  id: string;
  name: string;
  slug: string | null;
  createdByMagicCrm: boolean;
};

export type CreateOrganizationInvitationInput = {
  clerkOrganizationId: string;
  emailAddress: string;
  expiresInDays: number;
  inviterClerkUserId?: string;
  redirectUrl: string;
};

export type OrganizationDirectory = {
  createInvitation(input: CreateOrganizationInvitationInput): Promise<OrganizationInvitationRecord>;
  revokeInvitation(input: {
    clerkOrganizationId: string;
    invitationId: string;
    requestingClerkUserId?: string;
  }): Promise<void>;
  listInvitations(input: {
    clerkOrganizationId: string;
    statuses?: readonly ClerkOrganizationInvitationStatus[];
  }): Promise<readonly OrganizationInvitationRecord[]>;
  getInvitation(input: {
    clerkOrganizationId: string;
    invitationId: string;
  }): Promise<OrganizationInvitationRecord | null>;
  findMembershipsByEmail(input: {
    clerkOrganizationId: string;
    emailAddress: string;
  }): Promise<readonly OrganizationMembershipRecord[]>;
  createOrganization(input: {
    name: string;
    slug: string;
  }): Promise<ClerkOrganizationRecord>;
  getOrganizationBySlug(slug: string): Promise<ClerkOrganizationRecord | null>;
};

export function parseClerkOrganizationInvitationStatus(
  value: string | null | undefined,
): ClerkOrganizationInvitationStatus | null {
  if (
    value === CLERK_ORGANIZATION_INVITATION_STATUSES.PENDING ||
    value === CLERK_ORGANIZATION_INVITATION_STATUSES.ACCEPTED ||
    value === CLERK_ORGANIZATION_INVITATION_STATUSES.REVOKED ||
    value === CLERK_ORGANIZATION_INVITATION_STATUSES.EXPIRED
  ) {
    return value;
  }
  return null;
}
