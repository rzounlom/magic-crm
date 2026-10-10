import type { ReactNode } from "react";

import { PLANNER_FRAME_CLASS } from "@/components/layout/public-content";
import { personalEventPlannerTitle } from "@/lib/event-planner/labels";

type PublicInquiryViewProps = {
  organizationName: string;
  children: ReactNode;
};

export function PublicInquiryView({ organizationName, children }: PublicInquiryViewProps) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden py-4 sm:py-6">
      <div className={PLANNER_FRAME_CLASS}>
        <header className="shrink-0">
          <p className="page-eyebrow">{organizationName}</p>
          <h1 className="page-title text-2xl sm:text-3xl">{personalEventPlannerTitle(organizationName)}</h1>
          <p className="page-description">
            Tell us about your group, and we&apos;ll create personalized event options just for you.
          </p>
        </header>
        <div className="mt-6 flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </section>
  );
}
