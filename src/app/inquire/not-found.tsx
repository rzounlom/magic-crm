import { PublicCustomerShell } from "@/components/layout/public-customer-shell";
import { PublicStatusPanel } from "@/components/layout/public-status-panel";

export default function InquireNotFound() {
  return (
    <PublicCustomerShell>
      <PublicStatusPanel
        title="Event planner unavailable"
        description="We could not find an active event planner for this link. Check the address or contact the venue directly."
        hint="If you received this link from a venue, ask them for an updated invitation."
      />
    </PublicCustomerShell>
  );
}
