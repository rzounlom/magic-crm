import Link from "next/link";

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">Sales</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Inquiries</h1>
        </div>
        <a
          href={view.publicInquiryHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 cursor-pointer rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
        >
          Open Personal Event Planner
        </a>
      </div>
      <p className="mt-4 max-w-xl text-sm text-foreground/70">
        {archived
          ? "Archived inquiries are hidden from the active queue. History is kept. Archiving does not cancel a booking."
          : "Ready for Live Agent is the booking workspace queue. Customer-selected plans are prioritized. Confirmed events move to Bookings. This queue is not a payment tool."}
      </p>
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Inquiry views">
        <Link
          href="/app/inquiries"
          className={`rounded-md px-3 py-1.5 text-sm ${
            !archived ? "bg-primary text-primary-foreground" : "border border-border"
          }`}
        >
          Active
        </Link>
        <Link
          href="/app/inquiries?view=archived"
          className={`rounded-md px-3 py-1.5 text-sm ${
            archived ? "bg-primary text-primary-foreground" : "border border-border"
          }`}
        >
          Archived
        </Link>
      </nav>
      {view.inquiries.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/70">
          {archived ? "No archived inquiries." : "No inquiries yet."}
        </p>
      ) : (
        <LiveAgentInquiryQueue inquiries={view.inquiries} timeZone={view.timeZone} />
      )}
    </section>
  );
}
