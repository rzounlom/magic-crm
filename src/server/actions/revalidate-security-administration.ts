import { refresh, revalidatePath } from "next/cache";

const SECURITY_GROUPS_PATH = "/app/admin/security-groups";

export function revalidateSecurityAdministration(options?: {
  groupId?: string;
  refreshClient?: boolean;
}): void {
  revalidatePath("/app", "layout");
  revalidatePath(SECURITY_GROUPS_PATH);
  revalidatePath(`${SECURITY_GROUPS_PATH}/new`);
  if (options?.groupId) {
    revalidatePath(`${SECURITY_GROUPS_PATH}/${options.groupId}`);
  }
  if (options?.refreshClient !== false) {
    refresh();
  }
}
