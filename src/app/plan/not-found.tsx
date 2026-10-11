import { PublicCustomerShell } from "@/components/layout/public-customer-shell";
import { PublicStatusPanel } from "@/components/layout/public-status-panel";

export default function PlanNotFound() {
  return (
    <PublicCustomerShell>
      <PublicStatusPanel
        title="This event plan link is unavailable"
        description="The link may be incorrect or no longer active. Your original inquiry was not deleted."
        hint="If you still need help, contact the venue with the email you used when you started planning."
      />
    </PublicCustomerShell>
  );
}
