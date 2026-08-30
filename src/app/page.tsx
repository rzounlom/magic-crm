import { SiteShell } from "@/components/layout/site-shell";

export default function HomePage() {
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
        <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
          MagicCRM
        </p>
        <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Booking, CRM & AI-assisted event sales
        </h1>
        <p className="mt-8 max-w-md border-t border-border pt-6 text-sm text-foreground/70">
          Sign in to the employee application to work in your organization.
        </p>
      </div>
    </SiteShell>
  );
}
