export type UserProfileRecord = {
  id: string;
  clerkUserId: string | null;
  organizationId: string;
  defaultLocationId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserProfileByOrganizationWhere = {
  id: string;
  organizationId: string;
};

export type UserProfileReader = {
  userProfile: {
    findFirst: (args: { where: UserProfileByOrganizationWhere }) => Promise<UserProfileRecord | null>;
  };
};

export function createUserProfileRepository(db: UserProfileReader) {
  return {
    findById(input: { organizationId: string; userProfileId: string }): Promise<UserProfileRecord | null> {
      return db.userProfile.findFirst({
        where: {
          id: input.userProfileId,
          organizationId: input.organizationId,
        },
      });
    },
  };
}
