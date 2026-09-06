import {
  CLERK_ONBOARDING_METADATA_KEY,
  CLERK_ORGANIZATION_MEMBER_ROLE,
} from "@/types/team";
import {
  CLERK_ORGANIZATION_INVITATION_STATUSES,
  parseClerkOrganizationInvitationStatus,
  type ClerkOrganizationInvitationStatus,
  type ClerkOrganizationRecord,
  type OrganizationDirectory,
  type OrganizationInvitationRecord,
  type OrganizationMembershipRecord,
} from "@/lib/auth/organization-directory";
import { isClerkNotFoundError } from "@/server/team/clerk-invitation-errors";

const INVITATION_LIST_PAGE_SIZE = 100;
const INVITATION_LIST_MAX_PAGES = 20;

const ALL_CLERK_INVITATION_STATUSES: ClerkOrganizationInvitationStatus[] = [
  CLERK_ORGANIZATION_INVITATION_STATUSES.PENDING,
  CLERK_ORGANIZATION_INVITATION_STATUSES.ACCEPTED,
  CLERK_ORGANIZATION_INVITATION_STATUSES.REVOKED,
  CLERK_ORGANIZATION_INVITATION_STATUSES.EXPIRED,
];

export type ClerkOrganizationsApi = {
  createOrganizationInvitation: (params: {
    organizationId: string;
    emailAddress: string;
    role: typeof CLERK_ORGANIZATION_MEMBER_ROLE;
    expiresInDays: number;
    inviterUserId?: string;
    redirectUrl: string;
  }) => Promise<{
    id: string;
    emailAddress: string;
    organizationId: string;
    expiresAt: number | Date | null;
    status?: string | null;
  }>;
  revokeOrganizationInvitation: (params: {
    organizationId: string;
    invitationId: string;
    requestingUserId?: string;
  }) => Promise<unknown>;
  getOrganizationInvitationList: (params: {
    organizationId: string;
    status?: ClerkOrganizationInvitationStatus[];
    limit?: number;
    offset?: number;
  }) => Promise<{
    data: Array<{
      id: string;
      emailAddress: string;
      organizationId: string;
      expiresAt: number | Date | null;
      status?: string | null;
    }>;
    totalCount?: number;
  }>;
  getOrganizationInvitation: (params: {
    organizationId: string;
    invitationId: string;
  }) => Promise<{
    id: string;
    emailAddress: string;
    organizationId: string;
    expiresAt: number | Date | null;
    status?: string | null;
  }>;
  getOrganizationMembershipList: (params: {
    organizationId: string;
    emailAddress: string[];
    limit: number;
  }) => Promise<{
    data: Array<{
      publicUserData?: {
        userId?: string | null;
        identifier?: string | null;
      } | null;
    }>;
  }>;
  createOrganization: (params: {
    name: string;
    slug: string;
    privateMetadata: Record<string, boolean>;
  }) => Promise<{
    id: string;
    name: string;
    slug: string | null;
    privateMetadata?: Record<string, unknown> | null;
  }>;
  getOrganization: (params: { slug: string }) => Promise<{
    id: string;
    name: string;
    slug: string | null;
    privateMetadata?: Record<string, unknown> | null;
  }>;
};

function toInvitationRecord(invitation: {
  id: string;
  emailAddress: string;
  organizationId: string;
  expiresAt: number | Date | null;
  status?: string | null;
}): OrganizationInvitationRecord {
  const expiresAt =
    invitation.expiresAt instanceof Date
      ? invitation.expiresAt
      : typeof invitation.expiresAt === "number"
        ? new Date(invitation.expiresAt)
        : null;

  return {
    id: invitation.id,
    emailAddress: invitation.emailAddress,
    clerkOrganizationId: invitation.organizationId,
    expiresAt,
    status: parseClerkOrganizationInvitationStatus(invitation.status),
  };
}

function isMagicCrmOnboardingOrg(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.[CLERK_ONBOARDING_METADATA_KEY] === true;
}

function toOrganizationRecord(organization: {
  id: string;
  name: string;
  slug: string | null;
  privateMetadata?: Record<string, unknown> | null;
}): ClerkOrganizationRecord {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdByMagicCrm: isMagicCrmOnboardingOrg(organization.privateMetadata),
  };
}

export function createOrganizationDirectory(
  organizations: ClerkOrganizationsApi,
): OrganizationDirectory {
  return {
    async createInvitation(input) {
      const invitation = await organizations.createOrganizationInvitation({
        organizationId: input.clerkOrganizationId,
        emailAddress: input.emailAddress,
        role: CLERK_ORGANIZATION_MEMBER_ROLE,
        expiresInDays: input.expiresInDays,
        inviterUserId: input.inviterClerkUserId,
        redirectUrl: input.redirectUrl,
      });
      return toInvitationRecord(invitation);
    },

    async revokeInvitation(input) {
      await organizations.revokeOrganizationInvitation({
        organizationId: input.clerkOrganizationId,
        invitationId: input.invitationId,
        requestingUserId: input.requestingClerkUserId,
      });
    },

    async listInvitations(input) {
      const statuses = input.statuses?.length
        ? [...input.statuses]
        : ALL_CLERK_INVITATION_STATUSES;
      const collected: OrganizationInvitationRecord[] = [];

      for (let page = 0; page < INVITATION_LIST_MAX_PAGES; page += 1) {
        const offset = page * INVITATION_LIST_PAGE_SIZE;
        const result = await organizations.getOrganizationInvitationList({
          organizationId: input.clerkOrganizationId,
          status: statuses,
          limit: INVITATION_LIST_PAGE_SIZE,
          offset,
        });
        collected.push(...result.data.map(toInvitationRecord));
        if (result.data.length < INVITATION_LIST_PAGE_SIZE) {
          break;
        }
        if (typeof result.totalCount === "number" && collected.length >= result.totalCount) {
          break;
        }
      }

      return collected;
    },

    async getInvitation(input) {
      try {
        const invitation = await organizations.getOrganizationInvitation({
          organizationId: input.clerkOrganizationId,
          invitationId: input.invitationId,
        });
        return toInvitationRecord(invitation);
      } catch (error) {
        if (isClerkNotFoundError(error)) {
          return null;
        }
        throw error;
      }
    },

    async findMembershipsByEmail(input) {
      const page = await organizations.getOrganizationMembershipList({
        organizationId: input.clerkOrganizationId,
        emailAddress: [input.emailAddress],
        limit: 20,
      });

      const memberships: OrganizationMembershipRecord[] = [];
      for (const row of page.data) {
        const clerkUserId = row.publicUserData?.userId;
        if (!clerkUserId) {
          continue;
        }
        const identifier = row.publicUserData?.identifier;
        memberships.push({
          clerkUserId,
          emailAddresses: identifier ? [identifier] : [input.emailAddress],
        });
      }
      return memberships;
    },

    async createOrganization(input) {
      const organization = await organizations.createOrganization({
        name: input.name,
        slug: input.slug,
        privateMetadata: { [CLERK_ONBOARDING_METADATA_KEY]: true },
      });
      return toOrganizationRecord(organization);
    },

    async getOrganizationBySlug(slug) {
      try {
        const organization = await organizations.getOrganization({ slug });
        return toOrganizationRecord(organization);
      } catch (error) {
        if (isClerkNotFoundError(error)) {
          return null;
        }
        throw error;
      }
    },
  };
}
