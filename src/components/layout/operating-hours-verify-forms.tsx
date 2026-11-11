import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { SecurityActionResult } from "@/types/security-action";

type Props = {
  locationId: string;
  verificationStatus: string;
  verifyAction: (formData: FormData) => Promise<SecurityActionResult>;
  revertAction: (formData: FormData) => Promise<SecurityActionResult>;
};

export function OperatingHoursVerifyForms({
  locationId,
  verificationStatus,
  verifyAction,
  revertAction,
}: Props) {
  return (
    <div className="space-y-4">
      <SecurityActionForm
        action={verifyAction}
        notice={{
          successTitle: "Hours verified",
          errorTitle: "Unable to verify hours",
        }}
        confirm={{
          title: "Mark these hours VERIFIED?",
          description:
            "Confirm and HOLD will treat this schedule as authoritative for this location until it is edited or reverted.",
          confirmLabel: "Verify hours",
        }}
        className="space-y-3 rounded-[var(--radius-control)] border border-border/80 bg-surface p-4"
      >
        <input type="hidden" name="locationId" value={locationId} />
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Approval note</span>
          <textarea
            name="approvedByNote"
            required
            minLength={8}
            maxLength={500}
            rows={3}
            className="w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2"
            placeholder="Who confirmed these venue hours and when…"
          />
        </label>
        <PendingSubmitButton pendingLabel="Verifying…">Mark verified</PendingSubmitButton>
      </SecurityActionForm>

      {verificationStatus === "VERIFIED" ? (
        <SecurityActionForm
          action={revertAction}
          notice={{
            successTitle: "Hours reverted to draft",
            errorTitle: "Unable to revert hours",
          }}
          confirm={{
            title: "Revert to DRAFT?",
            description:
              "Verified status will clear. Staff will need hours exceptions again until re-verified.",
            confirmLabel: "Revert to draft",
          }}
        >
          <input type="hidden" name="locationId" value={locationId} />
          <PendingSubmitButton pendingLabel="Reverting…" variant="secondary">
            Revert to draft
          </PendingSubmitButton>
        </SecurityActionForm>
      ) : null}
    </div>
  );
}
