"use client";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { FieldInput } from "@/components/ui/field";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { SecurityActionResult } from "@/types/security-action";

export function CatalogSyncForm({
  action,
  confirmationPhrase,
  organizationName,
}: {
  action: (formData: FormData) => Promise<SecurityActionResult>;
  confirmationPhrase: string;
  organizationName: string;
}) {
  return (
    <SecurityActionForm
      action={action}
      className="mt-6"
      notice={{
        successTitle: "Catalog updated",
        errorTitle: "Unable to update catalog",
      }}
      confirm={{
        title: "Apply catalog update?",
        description: `This updates catalog records for ${organizationName} only. Unrelated products and other organizations stay unchanged.`,
        warning: "Type the confirmation phrase first. Existing bookings and quotes are not rewritten.",
        confirmLabel: "Apply catalog update",
        confirmPendingLabel: "Applying…",
      }}
      blocking
      blockingLabel="Updating catalog…"
    >
      <FieldInput
        label="Confirmation phrase"
        name="confirmation"
        required
        autoComplete="off"
        hint={`Type ${confirmationPhrase} exactly.`}
      />
      <div className="mt-4">
        <PendingSubmitButton pendingLabel="Applying…" variant="primary">
          Apply catalog update
        </PendingSubmitButton>
      </div>
    </SecurityActionForm>
  );
}
