import Link from "next/link";

import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { db } from "@/lib/db";
import { formatMoneyFromCents } from "@/lib/event-planner/money";
import { CUSTOMER_SELECTED_PLAN_BANNER } from "@/lib/inquiries/ready-for-human-reason";
import { formatInquiryQueueLabel } from "@/lib/inquiries/inquiry-status-display";
import { formatEventLocalDate, formatOrganizationTimestamp } from "@/lib/inquiries/tenant-datetime";
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

  const ready = view.inquiries.filter((inquiry) => inquiry.selectedEventPlanId);
  const rest = view.inquiries.filter((inquiry) => !inquiry.selectedEventPlanId);

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
        Public event inquiries and selected Personal Event Plans. Booking and proposals are not created
        here yet.
      </p>
      {view.inquiries.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/70">No inquiries yet.</p>
      ) : (
        <div className="mt-8 space-y-10">
          {ready.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold tracking-wide uppercase">
                {CUSTOMER_SELECTED_PLAN_BANNER}
              </h2>
              <p className="mt-1 text-sm text-foreground/70">
                These customers already chose an event concept. Start from the selected plan. Inventory
                is not reserved.
              </p>
              <ul className="mt-4 space-y-3">
                {ready.map((inquiry) => (
                  <InquiryRow key={inquiry.id} inquiry={inquiry} timeZone={view.timeZone} priority />
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            {ready.length > 0 ? <h2 className="text-lg font-semibold">Other inquiries</h2> : null}
            <ul className={ready.length > 0 ? "mt-4 space-y-3" : "space-y-3"}>
              {rest.map((inquiry) => (
                <InquiryRow key={inquiry.id} inquiry={inquiry} timeZone={view.timeZone} />
              ))}
            </ul>
          </section>
        </div>
      )}
    </section>
  );
}

function InquiryRow({
  inquiry,
  timeZone,
  priority = false,
}: {
  inquiry: Awaited<ReturnType<typeof listInquiries>>[number];
  timeZone: string;
  priority?: boolean;
}) {
  const selected = inquiry.eventPlanRecommendations.find((plan) => plan.id === inquiry.selectedEventPlanId);
  return (
    <li>
      <Link
        href={`/app/inquiries/${inquiry.id}`}
        className={`block rounded-md border px-4 py-4 hover:bg-muted/60 ${
          priority ? "border-primary/40 bg-primary/5" : "border-border"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">
              {inquiry.customerGroupName ||
                [inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") ||
                inquiry.customerEmail}
            </p>
            <p className="mt-1 text-sm text-foreground/70">
              {inquiry.eventType || "Event"}
              {inquiry.desiredDate ? ` · ${formatEventLocalDate(inquiry.desiredDate)}` : ""}
              {inquiry.guestCount ? ` · ${inquiry.guestCount} guests` : ""}
            </p>
          </div>
          <span className="text-xs font-medium tracking-wide text-foreground/60">
            {formatInquiryQueueLabel(inquiry)}
          </span>
        </div>
        {selected ? (
          <p className="mt-3 text-sm text-foreground/80">
            Selected: {selected.title}
            {selected.estimatedTotalCents
              ? ` · ${formatMoneyFromCents(selected.estimatedTotalCents, selected.currency)}`
              : ""}
          </p>
        ) : null}
        {inquiry.customerSelectedAt ? (
          <p className="mt-2 text-xs text-foreground/50">
            Selected {formatOrganizationTimestamp(inquiry.customerSelectedAt, timeZone)}
          </p>
        ) : (
          <p className="mt-2 text-xs text-foreground/50">
            {formatOrganizationTimestamp(inquiry.createdAt, timeZone)}
          </p>
        )}
      </Link>
    </li>
  );
}
