import Link from "next/link";
import { notFound } from "next/navigation";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { SecurityStatusPanel } from "@/components/layout/security-status-panel";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { db } from "@/lib/db";
import {
  resumeInquiryAiAction,
  sendEmployeeInquiryMessageAction,
  takeOverInquiryAction,
} from "@/server/actions/inquiries";
import { isAuthorizationError, isInquiryError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { hasPermission } from "@/server/policies/require-permission";
import { getInquiryDetail } from "@/server/services/inquiry-service";
import { MESSAGE_SENDER_TYPES } from "@/types/inquiry";
import { PERMISSIONS } from "@/types/permissions";

type InquiryDetailView =
  | { kind: "status"; title: string; body: string }
  | { kind: "missing" }
  | {
      kind: "ready";
      inquiry: NonNullable<Awaited<ReturnType<typeof getInquiryDetail>>>;
      canManage: boolean;
    };

async function loadInquiryDetailView(id: string): Promise<InquiryDetailView> {
  try {
    const ctx = await getRequestContext();
    const inquiry = await getInquiryDetail(ctx, db, id);
    if (!inquiry) {
      return { kind: "missing" };
    }
    const canManage = await hasPermission(ctx, PERMISSIONS.CRM_INQUIRIES_MANAGE, db);
    return { kind: "ready", inquiry, canManage };
  } catch (error) {
    if (isAuthorizationError(error) || isTenantContextError(error) || isInquiryError(error)) {
      return { kind: "status", title: "Inquiry", body: error.userMessage };
    }
    throw error;
  }
}

export default async function InquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await loadInquiryDetailView(id);
  if (view.kind === "status") {
    return <SecurityStatusPanel title={view.title} body={view.body} />;
  }
  if (view.kind === "missing") {
    notFound();
  }

  const { inquiry, canManage } = view;
  const conversation = inquiry.conversations[0];

  return (
    <section className="max-w-3xl">
      <Link href="/app/inquiries" className="text-sm text-primary">
        Back to inquiries
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        {[inquiry.customerFirstName, inquiry.customerLastName].filter(Boolean).join(" ") ||
          inquiry.customerEmail}
      </h1>
      <p className="mt-2 text-sm text-foreground/70">
        {inquiry.status.replaceAll("_", " ")}
        {inquiry.aiHandlingEnabled ? " · Event Assistant active" : " · Human handling"}
      </p>
      <dl className="mt-8 grid gap-4 border-t border-border pt-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-foreground/60">Email</dt>
          <dd className="mt-1">{inquiry.customerEmail}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Phone</dt>
          <dd className="mt-1">{inquiry.customerPhone || "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Event</dt>
          <dd className="mt-1">{inquiry.eventType || "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Date / time</dt>
          <dd className="mt-1">
            {inquiry.desiredDate?.toISOString().slice(0, 10) || "—"}
            {inquiry.desiredStartTime ? ` ${inquiry.desiredStartTime}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-foreground/60">Guests</dt>
          <dd className="mt-1">{inquiry.guestCount ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground/60">Occasion</dt>
          <dd className="mt-1">{inquiry.occasion || "—"}</dd>
        </div>
      </dl>
      {inquiry.internalSummary ? (
        <div className="mt-8 rounded-md border border-border px-4 py-4">
          <h2 className="text-sm font-medium text-foreground">Assistant summary</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{inquiry.internalSummary}</p>
        </div>
      ) : null}
      {inquiry.humanHandoffReason ? (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-medium">Human follow-up requested</p>
          <p className="mt-1 text-foreground/80">{inquiry.humanHandoffReason}</p>
        </div>
      ) : null}
      {canManage ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {inquiry.aiHandlingEnabled ? (
            <SecurityActionForm
              action={takeOverInquiryAction}
              notice={{ successTitle: "Conversation taken over", errorTitle: "Unable to take over" }}
            >
              <input type="hidden" name="inquiryId" value={inquiry.id} />
              <PendingSubmitButton
                pendingLabel="Taking over…"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Take over
              </PendingSubmitButton>
            </SecurityActionForm>
          ) : (
            <SecurityActionForm
              action={resumeInquiryAiAction}
              notice={{ successTitle: "Event Assistant resumed", errorTitle: "Unable to resume assistant" }}
            >
              <input type="hidden" name="inquiryId" value={inquiry.id} />
              <PendingSubmitButton pendingLabel="Resuming…" className="text-sm text-primary">
                Resume AI
              </PendingSubmitButton>
            </SecurityActionForm>
          )}
        </div>
      ) : null}
      <h2 className="mt-10 text-lg font-semibold">Conversation</h2>
      <ol className="mt-4 space-y-3">
        {(conversation?.messages ?? []).map((message) => (
          <li key={message.id} className="rounded-md border border-border px-4 py-3 text-sm">
            <p className="text-xs font-medium tracking-wide text-foreground/60 uppercase">
              {message.senderType === MESSAGE_SENDER_TYPES.CUSTOMER
                ? "Customer"
                : message.senderType === MESSAGE_SENDER_TYPES.EMPLOYEE
                  ? "Employee"
                  : message.senderType === MESSAGE_SENDER_TYPES.SYSTEM
                    ? "System"
                    : "Event Assistant"}
            </p>
            <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
          </li>
        ))}
      </ol>
      {canManage && conversation ? (
        <SecurityActionForm
          action={sendEmployeeInquiryMessageAction}
          className="mt-6 space-y-3"
          notice={{ successTitle: "Reply sent", errorTitle: "Unable to send reply" }}
        >
          <input type="hidden" name="inquiryId" value={inquiry.id} />
          <input type="hidden" name="conversationId" value={conversation.id} />
          <label className="block text-sm">
            <span className="text-foreground/70">Reply to customer</span>
            <textarea
              name="content"
              required
              rows={3}
              maxLength={2000}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <PendingSubmitButton
            pendingLabel="Sending…"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Send reply
          </PendingSubmitButton>
        </SecurityActionForm>
      ) : null}
    </section>
  );
}
