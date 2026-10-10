"use client";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  authorizeConfirmHoursExceptionAction,
  revokeConfirmHoursExceptionAction,
} from "@/server/actions/hours-exceptions";

export function AuthorizeHoursExceptionForm({
  inquiryId,
  eventSummary,
}: {
  inquiryId: string;
  eventSummary: string;
}) {
  return (
    <SecurityActionForm
      action={authorizeConfirmHoursExceptionAction}
      notice={{
        successTitle: "Hours exception authorized",
        errorTitle: "Unable to authorize exception",
      }}
      confirm={{
        title: "Authorize operating-hours exception?",
        description: `This creates a one-time exception for ${eventSummary}. It does not override resource conflicts, invalid local times, or capacity limits. Confirmation still rechecks availability.`,
        confirmLabel: "Authorize exception",
        confirmPendingLabel: "Authorizing…",
        warning: "Use only when management has approved this specific event outside normal hours policy.",
      }}
    >
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <label className="mt-3 block text-sm font-medium">
        Reason (required)
        <textarea
          name="reason"
          required
          minLength={8}
          maxLength={500}
          rows={3}
          placeholder="Why this exact event is approved outside the hours policy…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <PendingSubmitButton
        pendingLabel="Authorizing…"
        className="mt-3 w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium"
      >
        Authorize hours exception
      </PendingSubmitButton>
    </SecurityActionForm>
  );
}

export function RevokeHoursExceptionForm({
  inquiryId,
  exceptionId,
}: {
  inquiryId: string;
  exceptionId: string;
}) {
  return (
    <SecurityActionForm
      action={revokeConfirmHoursExceptionAction}
      notice={{
        successTitle: "Hours exception revoked",
        errorTitle: "Unable to revoke exception",
      }}
      confirm={{
        title: "Revoke this hours exception?",
        description: "The unused exception will no longer authorize confirmation for this event.",
        confirmLabel: "Revoke exception",
        confirmPendingLabel: "Revoking…",
      }}
    >
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <PendingSubmitButton
        pendingLabel="Revoking…"
        className="mt-2 w-full rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive"
      >
        Revoke unused exception
      </PendingSubmitButton>
    </SecurityActionForm>
  );
}
