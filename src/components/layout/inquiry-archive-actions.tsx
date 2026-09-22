import Link from "next/link";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { archiveInquiryConfirm, unarchiveInquiryConfirm } from "@/lib/ui/destructive-confirm";
import { archiveInquiryAction, unarchiveInquiryAction } from "@/server/actions/inquiries";
import { isCancellableBooking } from "@/types/booking";

export function InquiryArchiveActions({
  inquiryId,
  archived,
  canManage,
  bookingId,
  bookingNumber,
  bookingStatus,
}: {
  inquiryId: string;
  archived: boolean;
  canManage: boolean;
  bookingId?: string | null;
  bookingNumber?: string | null;
  bookingStatus?: string | null;
}) {
  if (!canManage) {
    return null;
  }

  const bookingHref = bookingId ? `/app/bookings/${bookingId}` : null;
  const activeBooking = isCancellableBooking(bookingStatus);

  if (archived) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-foreground/70">This inquiry is archived.</p>
        <SecurityActionForm
          action={unarchiveInquiryAction}
          notice={{ successTitle: "Inquiry restored", errorTitle: "Unable to restore inquiry" }}
          confirm={unarchiveInquiryConfirm()}
        >
          <input type="hidden" name="inquiryId" value={inquiryId} />
          <PendingSubmitButton
            pendingLabel="Restoring…"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium"
          >
            Unarchive Inquiry
          </PendingSubmitButton>
        </SecurityActionForm>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <SecurityActionForm
        action={archiveInquiryAction}
        notice={{ successTitle: "Inquiry archived", errorTitle: "Unable to archive inquiry" }}
        confirm={archiveInquiryConfirm({ bookingNumber, bookingStatus })}
      >
        <input type="hidden" name="inquiryId" value={inquiryId} />
        <PendingSubmitButton
          pendingLabel="Archiving…"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium"
        >
          Archive Inquiry
        </PendingSubmitButton>
      </SecurityActionForm>
      {activeBooking && bookingHref && bookingNumber ? (
        <p className="text-sm text-foreground/70">
          Booking stays active.{" "}
          <Link href={bookingHref} className="text-primary">
            Open {bookingNumber}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
