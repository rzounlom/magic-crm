import { refresh, revalidatePath } from "next/cache";

const SCHEDULE_PATH = "/app/schedule";
const INQUIRIES_PATH = "/app/inquiries";
const BOOKINGS_PATH = "/app/bookings";

/**
 * Invalidate inquiry / schedule / booking RSC caches after a mutation.
 *
 * Next.js 16: dynamic route paths passed to `revalidatePath` without a `type`
 * argument are a no-op — always pass `"page"` for `/app/inquiries/[id]` etc.
 *
 * Client refresh: `SecurityActionForm` awaits `router.refresh()` on success.
 * Default `refreshClient` is false to avoid a second RSC round-trip from
 * `next/cache` `refresh()` in the same Server Action. Pass `refreshClient: true`
 * only when the caller does not refresh on the client (rare).
 */
export function revalidateBookingWorkspace(options?: {
  inquiryId?: string;
  bookingId?: string;
  refreshClient?: boolean;
}): void {
  // Targeted pages only — full `/app` layout invalidation was redundant with
  // SecurityActionForm's awaited router.refresh() and inflated HOLD/Confirm UX latency.
  revalidatePath(SCHEDULE_PATH, "page");
  revalidatePath(INQUIRIES_PATH, "page");
  revalidatePath(BOOKINGS_PATH, "page");
  if (options?.inquiryId) {
    revalidatePath(`${INQUIRIES_PATH}/${options.inquiryId}`, "page");
  }
  if (options?.bookingId) {
    revalidatePath(`${BOOKINGS_PATH}/${options.bookingId}`, "page");
  }
  if (options?.refreshClient === true) {
    refresh();
  }
}
