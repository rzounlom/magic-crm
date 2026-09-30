import { SiteShell } from "@/components/layout/site-shell";

export default function HomePage() {
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
        <p className="page-eyebrow">MagicCRM</p>
        <h1 className="page-title mt-3 max-w-xl text-4xl sm:text-5xl">
          Booking, CRM & AI-assisted event sales
        </h1>
        <p className="page-description mt-6 max-w-md">
          Sign in to the employee application to work in your organization.
        </p>
      </div>
    </SiteShell>
  );
}
