/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { InquiryArchiveActions } from "@/components/layout/inquiry-archive-actions";
import { archiveInquiryConfirm, unarchiveInquiryConfirm } from "@/lib/ui/destructive-confirm";
import { BOOKING_STATUSES } from "@/types/booking";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

vi.mock("@/server/actions/inquiries", () => ({
  archiveInquiryAction: vi.fn(),
  unarchiveInquiryAction: vi.fn(),
}));

describe("inquiry archive actions", () => {
  it("warns that an active booking is not cancelled", () => {
    const copy = archiveInquiryConfirm({
      bookingNumber: "FUN-2026-00421",
      bookingStatus: BOOKING_STATUSES.CONFIRMED,
    });
    expect(copy.title).toBe("Archive this inquiry?");
    expect(copy.description).toContain("removed from the active inquiry queue");
    expect(copy.warning).toContain("FUN-2026-00421");
    expect(copy.warning).toContain("confirmed");
    expect(copy.confirmPendingLabel).toBe("Archiving…");

    const html = renderToStaticMarkup(
      <InquiryArchiveActions
        inquiryId="inq_1"
        archived={false}
        canManage
        bookingId="bk_1"
        bookingNumber="FUN-2026-00421"
        bookingStatus={BOOKING_STATUSES.CONFIRMED}
      />,
    );
    expect(html).toContain("Archive Inquiry");
    expect(html).toContain("/app/bookings/bk_1");
    expect(html).toContain("Booking stays active");
  });

  it("offers restore copy for archived inquiries", () => {
    const html = renderToStaticMarkup(
      <InquiryArchiveActions inquiryId="inq_1" archived canManage />,
    );
    expect(html).toContain("Unarchive Inquiry");
    expect(html).toContain("Restore this inquiry?");
    expect(html).toContain("Restore inquiry");
    expect(unarchiveInquiryConfirm().confirmPendingLabel).toBe("Restoring…");
  });
});
