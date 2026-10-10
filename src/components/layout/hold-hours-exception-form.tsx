"use client";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  authorizePlaceHoldHoursExceptionAction,
  revokePlaceHoldHoursExceptionAction,
} from "@/server/actions/hours-exceptions";

export function AuthorizePlaceHoldHoursExceptionForm({
  inquiryId,
  eventSummary,
}: {
  inquiryId: string;
  eventSummary: string;
}) {
  return (
    <SecurityActionForm
      action={authorizePlaceHoldHoursExceptionAction}
      notice={{
        successTitle: "Hours exception authorized",
        errorTitle: "Unable to authorize exception",
      }}
      confirm={{
        title: "Authorize operating-hours exception for HOLD?",
        description: `This creates a one-time PLACE_HOLD exception for ${eventSummary}. It does not override resource conflicts, invalid local times, or capacity limits. HOLD placement still rechecks availability.`,
        confirmLabel: "Authorize exception",
        confirmPendingLabel: "Authorizing…",
        warning: "Use only when management has approved this specific HOLD outside normal hours policy.",
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
          placeholder="Why this exact HOLD is approved outside the hours policy…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <PendingSubmitButton
        pendingLabel="Authorizing…"
        className="mt-3 w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium"
      >
        Authorize HOLD hours exception
      </PendingSubmitButton>
    </SecurityActionForm>
  );
}

export function RevokePlaceHoldHoursExceptionForm({
  inquiryId,
  exceptionId,
}: {
  inquiryId: string;
  exceptionId: string;
}) {
  return (
    <SecurityActionForm
      action={revokePlaceHoldHoursExceptionAction}
      notice={{
        successTitle: "Hours exception revoked",
        errorTitle: "Unable to revoke exception",
      }}
      confirm={{
        title: "Revoke this HOLD hours exception?",
        description: "The unused exception will no longer authorize HOLD placement for this event.",
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
