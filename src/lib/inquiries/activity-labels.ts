import { CUSTOMER_SELECTED_PLAN_BANNER } from "@/lib/inquiries/ready-for-human-reason";
import { INQUIRY_WORKFLOW_STAGE_LABELS } from "@/types/inquiry";

const ACTIVITY_LABELS: Record<string, string> = {
  "inquiry.created": "Customer submitted inquiry",
  "inquiry.plan_generated": "Personal Event Plan generated",
  "inquiry.plan_viewed": "Customer viewed plan",
  "inquiry.plan_selected": "Customer selected a plan — Ready for Live Agent",
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
  "ai.handoff_requested": "Inquiry entered Ready for Live Agent",
};

export function formatInquiryActivityAction(action: string): string {
  return ACTIVITY_LABELS[action] ?? action.replaceAll(".", " ");
}

export { CUSTOMER_SELECTED_PLAN_BANNER, INQUIRY_WORKFLOW_STAGE_LABELS };
