-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "onboardingStatus" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "organizations_onboardingStatus_idx" ON "organizations"("onboardingStatus");

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clerkOrganizationInvitationId" TEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "emailNormalized" VARCHAR(254) NOT NULL,
    "invitedByUserProfileId" TEXT,
    "status" VARCHAR(24) NOT NULL,
    "firstAdminIntent" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitation_security_groups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamInvitationId" TEXT NOT NULL,
    "securityGroupId" TEXT NOT NULL,

    CONSTRAINT "team_invitation_security_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_clerkOrganizationInvitationId_key" ON "team_invitations"("clerkOrganizationInvitationId");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_organizationId_id_key" ON "team_invitations"("organizationId", "id");

-- CreateIndex
CREATE INDEX "team_invitations_organizationId_status_idx" ON "team_invitations"("organizationId", "status");

-- CreateIndex
CREATE INDEX "team_invitations_organizationId_emailNormalized_status_idx" ON "team_invitations"("organizationId", "emailNormalized", "status");

-- One active pending invitation per organization + normalized email.
CREATE UNIQUE INDEX "team_invitations_pending_email_org_key"
ON "team_invitations"("organizationId", "emailNormalized")
WHERE status = 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "team_invitation_security_groups_teamInvitationId_securityG_key" ON "team_invitation_security_groups"("teamInvitationId", "securityGroupId");

-- CreateIndex
CREATE INDEX "team_invitation_security_groups_organizationId_idx" ON "team_invitation_security_groups"("organizationId");

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same-tenant inviter. MATCH SIMPLE skips the check when invitedByUserProfileId is null.
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_organizationId_invitedByUserProfileId_fkey" FOREIGN KEY ("organizationId", "invitedByUserProfileId") REFERENCES "user_profiles"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitation_security_groups" ADD CONSTRAINT "team_invitation_security_groups_organizationId_teamInvitat_fkey" FOREIGN KEY ("organizationId", "teamInvitationId") REFERENCES "team_invitations"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same-tenant queued group assignment.
ALTER TABLE "team_invitation_security_groups" ADD CONSTRAINT "team_invitation_security_groups_organizationId_securityGro_fkey" FOREIGN KEY ("organizationId", "securityGroupId") REFERENCES "security_groups"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
