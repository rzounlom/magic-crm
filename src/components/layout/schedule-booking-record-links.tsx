import Link from "next/link";

export function ScheduleBookingRecordLinks({
  inquiryId,
  bookingId,
}: {
  inquiryId?: string | null;
  bookingId?: string | null;
}) {
  if (!inquiryId && !bookingId) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {bookingId ? (
        <Link
          href={`/app/bookings/${bookingId}`}
          className="font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Open booking
        </Link>
      ) : null}
      {inquiryId ? (
        <Link
          href={`/app/inquiries/${inquiryId}`}
          className="font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Open inquiry
        </Link>
      ) : null}
    </div>
  );
}
