import { revalidatePath } from "next/cache";

import { revalidateBookingWorkspace } from "@/server/actions/revalidate-booking-workspace";

const RESOURCE_PATH = "/app/admin/resources";
const SCHEDULE_PATH = "/app/schedule";

export function revalidateResourceAdministration() {
  revalidatePath(RESOURCE_PATH);
  revalidatePath(SCHEDULE_PATH);
}

/** Schedule + inquiry/booking paths; refreshes the client router after Server Actions. */
export function revalidateScheduleAndInquiry(inquiryId?: string) {
  revalidateBookingWorkspace({ inquiryId, refreshClient: true });
}
