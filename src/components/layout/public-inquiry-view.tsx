import type { ReactNode } from "react";

import { personalEventPlannerTitle } from "@/lib/event-planner/labels";

type PublicInquiryViewProps = {
  organizationName: string;
  children: ReactNode;
};

export function PublicInquiryView({ organizationName, children }: PublicInquiryViewProps) {
  return (
    <section className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
        {organizationName}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        {personalEventPlannerTitle(organizationName)}
      </h1>
      <p className="mt-4 text-sm text-foreground/70">
        Tell us about your group, and we&apos;ll create personalized event options just for you.
      </p>
      {children}
    </section>
  );
}
