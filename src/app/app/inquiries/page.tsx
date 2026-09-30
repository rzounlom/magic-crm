import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

import { LiveAgentInquiryQueue } from "@/components/layout/live-agent-inquiry-queue";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
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
  searchParams: Promise<{ view?: string }>;
}) {
  const search = await searchParams;
  const view = await loadInquiriesView(search.view);
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

  const archived = view.listView === INQUIRY_LIST_VIEWS.ARCHIVED;

  return (
    <section className="max-w-4xl">
      <PageHeader
        eyebrow="Sales"
        title="Inquiries"
        actions={
          <a
            href={view.publicInquiryHref}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:border-primary/40"
          >
            Open Personal Event Planner
          </a>
        }
      />
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
        {archived
          ? "Archived inquiries and confirmed events that have already ended stay here. History is kept. Nothing is deleted, and archiving does not cancel a booking."
          : "Ready for Live Agent is the booking workspace queue. Customer-selected plans are prioritized. A confirmed event leaves this queue after it ends and stays in Archived. This queue is not a payment tool."}
      </p>
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Inquiry views">
        <Link
          href="/app/inquiries"
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
            !archived ? "bg-primary text-primary-foreground" : "bg-surface text-foreground shadow-sm"
          }`}
        >
          Active
        </Link>
        <Link
          href="/app/inquiries?view=archived"
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
            archived ? "bg-primary text-primary-foreground" : "bg-surface text-foreground shadow-sm"
          }`}
        >
          Archived
        </Link>
      </nav>
      {view.inquiries.length === 0 ? (
        <EmptyState title={archived ? "No archived inquiries." : "No inquiries yet."} />
      ) : (
        <LiveAgentInquiryQueue inquiries={view.inquiries} timeZone={view.timeZone} />
      )}
    </section>
  );
}
