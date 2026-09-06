import {
  CLERK_ORGANIZATION_INVITATION_STATUSES,
  type ClerkOrganizationInvitationStatus,
  type ClerkOrganizationRecord,
  type OrganizationDirectory,
  type OrganizationInvitationRecord,
  type OrganizationMembershipRecord,
} from "@/lib/auth/organization-directory";

type FakeInvitation = OrganizationInvitationRecord & {
  redirectUrl: string;
};

export type FakeOrganizationDirectory = OrganizationDirectory & {
  createdInvitations: FakeInvitation[];
  revokedInvitationIds: string[];
  organizations: Map<string, ClerkOrganizationRecord>;
  memberships: Map<string, OrganizationMembershipRecord[]>;
  failNextCreateInvitation?: unknown;
  failNextCreateOrganization?: unknown;
  failNextRevokeInvitation?: unknown;
  failNextListInvitations?: unknown;
  setInvitationStatus(
    invitationId: string,
    status: ClerkOrganizationInvitationStatus,
  ): void;
  removeInvitation(invitationId: string): void;
};

function membershipKey(clerkOrganizationId: string, email: string): string {
  return `${clerkOrganizationId}:${email.trim().toLowerCase()}`;
}

function clerkError(code: string, status: number, message: string) {
  return {
    clerkError: true,
    status,
    errors: [{ code, message, longMessage: message }],
  };
}

export function createFakeOrganizationDirectory(): FakeOrganizationDirectory {
  const organizations = new Map<string, ClerkOrganizationRecord>();
  const memberships = new Map<string, OrganizationMembershipRecord[]>();
  const createdInvitations: FakeInvitation[] = [];
  const revokedInvitationIds: string[] = [];
  let invitationCount = 0;
  let organizationCount = 0;

  const directory: FakeOrganizationDirectory = {
    createdInvitations,
    revokedInvitationIds,
    organizations,
    memberships,
    setInvitationStatus(invitationId, status) {
      const invitation = createdInvitations.find((row) => row.id === invitationId);
      if (invitation) {
        invitation.status = status;
      }
    },
    removeInvitation(invitationId) {
      const index = createdInvitations.findIndex((row) => row.id === invitationId);
      if (index >= 0) {
        createdInvitations.splice(index, 1);
      }
    },
    async createInvitation(input) {
      if (directory.failNextCreateInvitation) {
        const error = directory.failNextCreateInvitation;
        directory.failNextCreateInvitation = undefined;
        throw error;
      }
      const pending = createdInvitations.find(
        (row) =>
          row.clerkOrganizationId === input.clerkOrganizationId &&
          row.emailAddress.toLowerCase() === input.emailAddress.toLowerCase() &&
          row.status === CLERK_ORGANIZATION_INVITATION_STATUSES.PENDING,
      );
      if (pending) {
        throw clerkError("duplicate_record", 400, "already been invited");
      }
      invitationCount += 1;
      const invitation: FakeInvitation = {
        id: `orginv_${invitationCount}`,
        emailAddress: input.emailAddress,
        clerkOrganizationId: input.clerkOrganizationId,
        expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
        status: CLERK_ORGANIZATION_INVITATION_STATUSES.PENDING,
        redirectUrl: input.redirectUrl,
      };
      createdInvitations.push(invitation);
      return invitation;
    },
    async revokeInvitation(input) {
      if (directory.failNextRevokeInvitation) {
        const error = directory.failNextRevokeInvitation;
        directory.failNextRevokeInvitation = undefined;
        throw error;
      }
      const invitation = createdInvitations.find(
        (row) =>
          row.id === input.invitationId && row.clerkOrganizationId === input.clerkOrganizationId,
      );
      if (!invitation) {
        throw clerkError("resource_not_found", 404, "No invitation was found");
      }
      if (invitation.status !== CLERK_ORGANIZATION_INVITATION_STATUSES.PENDING) {
        throw clerkError(
          "organization_invitation_not_pending",
          404,
          'The organization invitation is not in the "pending" status.',
        );
      }
      revokedInvitationIds.push(input.invitationId);
      invitation.status = CLERK_ORGANIZATION_INVITATION_STATUSES.REVOKED;
    },
    async listInvitations(input) {
      if (directory.failNextListInvitations) {
        const error = directory.failNextListInvitations;
        directory.failNextListInvitations = undefined;
        throw error;
      }
      const allowed = new Set(
        input.statuses ?? [
          CLERK_ORGANIZATION_INVITATION_STATUSES.PENDING,
          CLERK_ORGANIZATION_INVITATION_STATUSES.ACCEPTED,
          CLERK_ORGANIZATION_INVITATION_STATUSES.REVOKED,
          CLERK_ORGANIZATION_INVITATION_STATUSES.EXPIRED,
        ],
      );
      return createdInvitations.filter(
        (row) =>
          row.clerkOrganizationId === input.clerkOrganizationId &&
          row.status !== null &&
          allowed.has(row.status),
      );
    },
    async getInvitation(input) {
      return (
        createdInvitations.find(
          (row) =>
            row.id === input.invitationId && row.clerkOrganizationId === input.clerkOrganizationId,
        ) ?? null
      );
    },
    async findMembershipsByEmail(input) {
      return memberships.get(membershipKey(input.clerkOrganizationId, input.emailAddress)) ?? [];
    },
    async createOrganization(input) {
      if (directory.failNextCreateOrganization) {
        const error = directory.failNextCreateOrganization;
        directory.failNextCreateOrganization = undefined;
        throw error;
      }
      organizationCount += 1;
      const organization: ClerkOrganizationRecord = {
        id: `org_${organizationCount}_${input.slug}`,
        name: input.name,
        slug: input.slug,
        createdByMagicCrm: true,
      };
      organizations.set(input.slug, organization);
      return organization;
    },
    async getOrganizationBySlug(slug) {
      return organizations.get(slug) ?? null;
    },
  };

  return directory;
}

export function addFakeMembership(
  directory: FakeOrganizationDirectory,
  clerkOrganizationId: string,
  email: string,
  clerkUserId = "user_existing",
): void {
  const key = membershipKey(clerkOrganizationId, email);
  const current = directory.memberships.get(key) ?? [];
  current.push({ clerkUserId, emailAddresses: [email] });
  directory.memberships.set(key, current);
}
