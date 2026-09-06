export const TEAM_INVITATION_STATUSES = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
} as const;

export type TeamInvitationStatus =
  (typeof TEAM_INVITATION_STATUSES)[keyof typeof TEAM_INVITATION_STATUSES];

export const ONBOARDING_STATUSES = {
  PROVISIONING: "PROVISIONING",
  AWAITING_ADMIN: "AWAITING_ADMIN",
  ACTIVE: "ACTIVE",
  FAILED: "FAILED",
} as const;

export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[keyof typeof ONBOARDING_STATUSES];

export const CLERK_ORGANIZATION_MEMBER_ROLE = "org:member" as const;

export const TEAM_INVITATION_EXPIRES_IN_DAYS = 14;

export const CLERK_ONBOARDING_METADATA_KEY = "magiccrmClientOnboarding";
