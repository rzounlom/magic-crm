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

type InquiriesView =
  | { kind: "status"; title: string; body: string }
  | {
      kind: "ready";
      inquiries: Awaited<ReturnType<typeof listInquiries>>;
      publicInquiryHref: string;
      timeZone: string;
    };

async function loadInquiriesView(): Promise<InquiriesView> {
  try {
    const ctx = await getRequestContext();
    const [inquiries, publicInquiryHref, timeZone] = await Promise.all([
      listInquiries(ctx, db),
      getCurrentTenantPublicInquiryPath(ctx, db),
      getCurrentTenantTimezone(ctx, db),
    ]);
    return { kind: "ready", inquiries, publicInquiryHref, timeZone };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
      return { kind: "status", title: "Inquiries", body: error.userMessage };
    }
    throw error;
  }
}

export default async function InquiriesPage() {
  const view = await loadInquiriesView();
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }

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
        Ready for Live Agent is the booking workspace queue. Customer-selected plans are prioritized. This is
        not a booking or payment tool.
      </p>
      {view.inquiries.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/70">No inquiries yet.</p>
      ) : (
        <LiveAgentInquiryQueue inquiries={view.inquiries} timeZone={view.timeZone} />
      )}
    </section>
  );
}
