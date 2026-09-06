import type { ReactNode } from "react";

type PublicInquiryViewProps = {
  organizationName: string;
  children: ReactNode;
};

export function PublicInquiryView({ organizationName, children }: PublicInquiryViewProps) {
  return (
    <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
        {organizationName}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Plan an event</h1>
      <p className="mt-4 text-sm text-foreground/70">
        Tell us what you have in mind. The Event Assistant will reply right away. A team member can
        join if you need a person.
      </p>
      {children}
    </section>
  );
}
