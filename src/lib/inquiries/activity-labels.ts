import { CUSTOMER_SELECTED_PLAN_BANNER } from "@/lib/inquiries/ready-for-human-reason";
import { INQUIRY_WORKFLOW_STAGE_LABELS } from "@/types/inquiry";

const ACTIVITY_LABELS: Record<string, string> = {
  "inquiry.created": "Inquiry created",
  "inquiry.plan_generated": "Personal Event Plan generated",
  "inquiry.plan_viewed": "Customer viewed plan",
  "inquiry.plan_selected": "Customer submitted an inquiry — Ready for Live Agent",
  "inquiry.submitted_for_followup": "Customer submitted an inquiry for follow-up",
  "inquiry.availability_checked": "Availability checked",
  "booking.pending_created": "Pending booking created",
  "booking.pending_updated": "Pending booking updated",
  "booking.payment_attested": "External payment attested",
  "booking.confirmation_attempted": "Booking confirmation attempted",
  "booking.confirmation_conflict": "Booking confirmation hit an availability conflict",
  "inquiry.started_working": "Started working this inquiry",
  "inquiry.working_plan_updated": "Working version updated",
  "inquiry.ready_to_finalize": "Marked ready to finalize",
  "inquiry.internal_note_added": "Internal note added",
  "inquiry.customer_contacted": "Customer contacted",
  "employee.conversation_taken_over": "Employee took over",
  "resource.hold_created": "Resource hold placed",
  "resource.hold_released": "Resource hold released",
  "resource.hold_updated": "Resource hold updated",
  "resource.hold_extended": "Resource hold extended",
  "resource.converted_to_booked": "Resource holds converted to BOOKED",
  "booking.confirmed": "Booking confirmed",
  "booking.cancelled": "Booking cancelled",
  "resource_reservations.released_for_cancellation": "Resources released for cancelled booking",
  "inquiry.archived": "Inquiry archived",
  "inquiry.unarchived": "Inquiry restored from archive",
  "inquiry.converted_to_booking": "Inquiry converted to Booking",
  "communication.booking_confirmation_skipped": "booking.confirmed recorded (email skipped — no provider)",
  "ai.handoff_requested": "Inquiry entered Ready for Live Agent",
};

export function formatInquiryActivityAction(action: string): string {
  return ACTIVITY_LABELS[action] ?? action.replaceAll(".", " ");
}

export { CUSTOMER_SELECTED_PLAN_BANNER, INQUIRY_WORKFLOW_STAGE_LABELS };
