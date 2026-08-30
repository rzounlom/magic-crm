import type { RequestContext } from "@/server/request-context";

export type UserProfileRecord = {
  id: string;
  clerkUserId: string;
  organizationId: string;
  defaultLocationId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserProfileReader = {
  userProfile: {
    findFirst: (args: {
      where: {
        id?: string;
        organizationId: string;
        clerkUserId?: string;
      };
    }) => Promise<UserProfileRecord | null>;
  };
};

export function createUserProfileRepository(db: UserProfileReader) {
  return {
    findById(ctx: Pick<RequestContext, "organizationId">, userProfileId: string): Promise<UserProfileRecord | null> {
      return db.userProfile.findFirst({
        where: {
          id: userProfileId,
          organizationId: ctx.organizationId,
        },
      });
    },

    findByClerkUser(
      ctx: Pick<RequestContext, "organizationId">,
      clerkUserId: string,
    ): Promise<UserProfileRecord | null> {
      return db.userProfile.findFirst({
        where: {
          organizationId: ctx.organizationId,
          clerkUserId,
        },
      });
    },
  };
}
