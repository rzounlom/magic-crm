import Link from "next/link";
import { Suspense } from "react";

import { InquiryQueueFocus } from "@/components/layout/inquiry-queue-focus";
import { LiveAgentInquiryQueue } from "@/components/layout/live-agent-inquiry-queue";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { buttonClassName, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { cn } from "@/lib/ui/cn";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import {
  getCurrentTenantPublicInquiryPath,
  getCurrentTenantTimezone,
  listInquiries,
} from "@/server/services/inquiry-service";
import { INQUIRY_LIST_VIEWS, parseInquiryListView } from "@/types/inquiry";

type InquiriesView =
  | { kind: "status"; title: string; body: string }
  | {
      kind: "ready";
      inquiries: Awaited<ReturnType<typeof listInquiries>>;
      publicInquiryHref: string;
      timeZone: string;
      listView: ReturnType<typeof parseInquiryListView>;
    };

async function loadInquiriesView(viewParam: string | undefined): Promise<InquiriesView> {
  try {
    const ctx = await getRequestContext();
    const listView = parseInquiryListView(viewParam);
    const [inquiries, publicInquiryHref, timeZone] = await Promise.all([
      listInquiries(ctx, db, { view: listView }),
      getCurrentTenantPublicInquiryPath(ctx, db),
      getCurrentTenantTimezone(ctx, db),
    ]);
    return { kind: "ready", inquiries, publicInquiryHref, timeZone, listView };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
      return { kind: "status", title: "Inquiries", body: error.userMessage };
    }
    throw error;
  }
}

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; focus?: string }>;
}) {
  const search = await searchParams;
  const view = await loadInquiriesView(search.view);
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  const archived = view.listView === INQUIRY_LIST_VIEWS.ARCHIVED;

  return (
    <section className="mx-auto w-full min-w-0 max-w-4xl">
      <PageHeader
        eyebrow="Sales"
        title="Inquiries"
        description={
          archived
            ? "Archived inquiries and ended confirmed events. History is kept."
            : "Work through pending confirmation and staff-review inquiries. Confirmed events move to Archived after they end."
        }
        actions={
          <ButtonLink
            href={view.publicInquiryHref}
            variant="secondary"
            size="sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Public inquiry form
          </ButtonLink>
        }
      />
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Inquiry views">
        <Link
          href="/app/inquiries"
          className={cn(
            buttonClassName({
              variant: !archived ? "primary" : "secondary",
              size: "sm",
              className: "rounded-full",
            }),
          )}
          aria-current={!archived ? "page" : undefined}
        >
          Active
        </Link>
        <Link
          href="/app/inquiries?view=archived"
          className={cn(
            buttonClassName({
              variant: archived ? "primary" : "secondary",
              size: "sm",
              className: "rounded-full",
            }),
          )}
          aria-current={archived ? "page" : undefined}
        >
          Archived
        </Link>
      </nav>
      {!archived ? (
        <Suspense fallback={null}>
          <InquiryQueueFocus />
        </Suspense>
      ) : null}
      {view.inquiries.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={archived ? "No archived inquiries." : "No inquiries yet."}
            detail={
              archived
                ? "Archived and completed events will appear here."
                : "New customer inquiries will appear in Active when they need follow-up."
            }
          />
        </div>
      ) : (
        <LiveAgentInquiryQueue inquiries={view.inquiries} timeZone={view.timeZone} />
      )}
    </section>
  );
}
