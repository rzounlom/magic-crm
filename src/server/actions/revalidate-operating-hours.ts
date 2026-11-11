import { revalidatePath } from "next/cache";

const HOURS_PATH = "/app/admin/operating-hours";

export function revalidateOperatingHoursAdministration(locationId?: string) {
  revalidatePath(HOURS_PATH);
  if (locationId) {
    revalidatePath(`${HOURS_PATH}/${locationId}`);
  }
}
