import { inquiryFunnelStages } from "@/lib/inquiries/inquiry-funnel";
import { formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";

export function InquiryFunnel({
  inquiry,
  timeZone,
}: {
  inquiry: {
    createdAt: Date;
    recommendationsGeneratedAt: Date | null;
    recommendationsViewedAt: Date | null;
    customerSelectedAt: Date | null;
    humanHandoffRequestedAt?: Date | null;
    status: string;
    selectedPlanTitle?: string | null;
    selectedPlanTier?: string | null;
  };
  timeZone: string;
}) {
  const stages = inquiryFunnelStages(inquiry);
  return (
    <ol className="mt-3 flex flex-col gap-2 text-sm">
      {stages.map((stage) => (
        <li key={stage.id} className={stage.complete ? "text-foreground" : "text-foreground/45"}>
          <span className="mr-2">{stage.complete ? "●" : "○"}</span>
          {stage.label}
          {stage.complete && stage.at ? (
            <span className="ml-2 text-xs text-foreground/55">
              {formatOrganizationTimestamp(stage.at, timeZone)}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
