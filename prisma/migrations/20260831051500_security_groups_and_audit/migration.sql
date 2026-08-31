-- CreateTable
CREATE TABLE "permission_definitions" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "module" VARCHAR(40) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_groups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemKey" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_group_permissions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "securityGroupId" TEXT NOT NULL,
    "permissionDefinitionId" TEXT NOT NULL,

    CONSTRAINT "security_group_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_group_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "securityGroupId" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserProfileId" TEXT,
    "action" VARCHAR(80) NOT NULL,
    "resourceType" VARCHAR(80) NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permission_definitions_key_key" ON "permission_definitions"("key");

-- CreateIndex
CREATE INDEX "permission_definitions_module_idx" ON "permission_definitions"("module");

-- CreateIndex
CREATE INDEX "permission_definitions_active_idx" ON "permission_definitions"("active");

-- CreateIndex
CREATE INDEX "security_groups_organizationId_idx" ON "security_groups"("organizationId");

-- CreateIndex
CREATE INDEX "security_groups_organizationId_isSystem_idx" ON "security_groups"("organizationId", "isSystem");

-- CreateIndex
CREATE UNIQUE INDEX "security_groups_organizationId_id_key" ON "security_groups"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "security_groups_organizationId_name_key" ON "security_groups"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "security_groups_organizationId_systemKey_key" ON "security_groups"("organizationId", "systemKey");

-- CreateIndex
CREATE INDEX "security_group_permissions_organizationId_idx" ON "security_group_permissions"("organizationId");

-- CreateIndex
CREATE INDEX "security_group_permissions_permissionDefinitionId_idx" ON "security_group_permissions"("permissionDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "security_group_permissions_securityGroupId_permissionDefini_key" ON "security_group_permissions"("securityGroupId", "permissionDefinitionId");

-- CreateIndex
CREATE INDEX "security_group_members_organizationId_idx" ON "security_group_members"("organizationId");

-- CreateIndex
CREATE INDEX "security_group_members_userProfileId_idx" ON "security_group_members"("userProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "security_group_members_securityGroupId_userProfileId_key" ON "security_group_members"("securityGroupId", "userProfileId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_resourceType_resourceId_idx" ON "audit_logs"("organizationId", "resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_organizationId_id_key" ON "user_profiles"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "security_groups" ADD CONSTRAINT "security_groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_group_permissions" ADD CONSTRAINT "security_group_permissions_organizationId_securityGroupId_fkey" FOREIGN KEY ("organizationId", "securityGroupId") REFERENCES "security_groups"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_group_permissions" ADD CONSTRAINT "security_group_permissions_permissionDefinitionId_fkey" FOREIGN KEY ("permissionDefinitionId") REFERENCES "permission_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_group_members" ADD CONSTRAINT "security_group_members_organizationId_securityGroupId_fkey" FOREIGN KEY ("organizationId", "securityGroupId") REFERENCES "security_groups"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_group_members" ADD CONSTRAINT "security_group_members_organizationId_userProfileId_fkey" FOREIGN KEY ("organizationId", "userProfileId") REFERENCES "user_profiles"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
