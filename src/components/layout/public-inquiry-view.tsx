import type { ReactNode } from "react";

import { PUBLIC_CONTENT_CLASS } from "@/components/layout/public-content";
import { personalEventPlannerTitle } from "@/lib/event-planner/labels";

type PublicInquiryViewProps = {
  organizationName: string;
  children: ReactNode;
};

export function PublicInquiryView({ organizationName, children }: PublicInquiryViewProps) {
  return (
    <section className={`${PUBLIC_CONTENT_CLASS} flex h-full min-h-0 flex-col overflow-hidden py-4`}>
      <header className="shrink-0">
        <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
          {organizationName}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {personalEventPlannerTitle(organizationName)}
        </h1>
        <p className="mt-2 text-sm text-foreground/70">
          Tell us about your group, and we&apos;ll create personalized event options just for you.
        </p>
      </header>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
