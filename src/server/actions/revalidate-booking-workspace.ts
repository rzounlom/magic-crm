import { refresh, revalidatePath } from "next/cache";

const SCHEDULE_PATH = "/app/schedule";
const INQUIRIES_PATH = "/app/inquiries";
const BOOKINGS_PATH = "/app/bookings";

/**
 * Invalidate inquiry / schedule / booking RSC caches and refresh the client router.
 *
 * Next.js 16: dynamic route paths passed to `revalidatePath` without a `type`
 * argument are a no-op — always pass `"page"` for `/app/inquiries/[id]` etc.
 * Call `refresh()` so the Server Action response updates the client router
 * (read-your-own-writes) without relying on a hard navigation.
 */
export function revalidateBookingWorkspace(options?: {
  inquiryId?: string;
  bookingId?: string;
  refreshClient?: boolean;
}): void {
  revalidatePath("/app", "layout");
  revalidatePath(SCHEDULE_PATH, "page");
  revalidatePath(INQUIRIES_PATH, "page");
  revalidatePath(BOOKINGS_PATH, "page");
  if (options?.inquiryId) {
    revalidatePath(`${INQUIRIES_PATH}/${options.inquiryId}`, "page");
  }
  if (options?.bookingId) {
    revalidatePath(`${BOOKINGS_PATH}/${options.bookingId}`, "page");
  }
  if (options?.refreshClient !== false) {
    refresh();
  }
}
