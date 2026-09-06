import { refresh, revalidatePath } from "next/cache";

import { revalidateSecurityAdministration } from "@/server/actions/revalidate-security-administration";

const TEAM_PATH = "/app/admin/team";

export function revalidateTeamAdministration(options?: {
  userProfileId?: string;
  refreshClient?: boolean;
}): void {
  revalidatePath("/app", "layout");
  revalidatePath(TEAM_PATH);
  revalidatePath(`${TEAM_PATH}/invitations`);
  revalidatePath(`${TEAM_PATH}/invite`);
  if (options?.userProfileId) {
    revalidatePath(`${TEAM_PATH}/${options.userProfileId}`);
  }
  revalidateSecurityAdministration({ refreshClient: false });
  if (options?.refreshClient !== false) {
    refresh();
  }
}
