import Link from "next/link";
import { redirect } from "next/navigation";

import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { invitationAcceptNavigation } from "@/lib/auth/application-url";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ __clerk_ticket?: string; __clerk_status?: string }>;
}) {
  const params = await searchParams;
  const next = invitationAcceptNavigation({
    clerkStatus: params.__clerk_status,
    clerkTicket: params.__clerk_ticket,
  });

  if (next.kind === "redirect") {
    redirect(next.href);
  }

  return (
    <section className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">MagicCRM</p>
      <SecurityStatusPanel
        title="Invitation not available"
        body="This invitation is invalid, expired, or no longer usable. If you already joined, sign in to continue."
      />
      <p className="mt-6 text-sm">
        <Link href="/sign-in" className="text-primary">
          Sign in
        </Link>
      </p>
    </section>
  );
}
