import Link from "next/link";

import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import {
  getCurrentTenantPublicInquiryPath,
  listInquiries,
} from "@/server/services/inquiry-service";

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

type InquiriesView =
  | { kind: "status"; title: string; body: string }
  | {
      kind: "ready";
      inquiries: Awaited<ReturnType<typeof listInquiries>>;
      publicInquiryHref: string;
    };

async function loadInquiriesView(): Promise<InquiriesView> {
  try {
    const ctx = await getRequestContext();
    const [inquiries, publicInquiryHref] = await Promise.all([
      listInquiries(ctx, db),
      getCurrentTenantPublicInquiryPath(ctx, db),
    ]);
    return { kind: "ready", inquiries, publicInquiryHref };
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
          Open public inquiry form
        </a>
      </div>
      <p className="mt-4 max-w-xl text-sm text-foreground/70">
        Event inquiries from the public web assistant. Booking and proposals are not created here yet.
      </p>
      {view.inquiries.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/70">No inquiries yet.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {view.inquiries.map((inquiry) => {
            const last = inquiry.conversations[0]?.messages[0];
            return (
              <li key={inquiry.id}>
                <Link
                  href={`/app/inquiries/${inquiry.id}`}
                  className="block rounded-md border border-border px-4 py-4 hover:bg-muted/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {[inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") ||
                          inquiry.customerEmail}
                      </p>
                      <p className="mt-1 text-sm text-foreground/70">
                        {inquiry.eventType || "Event"}
                        {inquiry.desiredDate
                          ? ` · ${inquiry.desiredDate.toISOString().slice(0, 10)}`
                          : ""}
                        {inquiry.guestCount ? ` · ${inquiry.guestCount} guests` : ""}
                      </p>
                    </div>
                    <span className="text-xs font-medium tracking-wide text-foreground/60 uppercase">
                      {statusLabel(inquiry.status)}
                      {inquiry.aiHandlingEnabled ? " · Assistant" : " · Human"}
                    </span>
                  </div>
                  {last ? (
                    <p className="mt-3 line-clamp-2 text-sm text-foreground/60">{last.content}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-foreground/50">
                    {inquiry.createdAt.toLocaleString()}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
