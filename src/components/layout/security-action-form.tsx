"use client";

import { useRouter } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PendingActionProvider } from "@/components/ui/pending-submit-button";
import {
  onConfirmDialogChoice,
  onDestructiveSubmitAttempt,
  onSafeSubmitAttempt,
} from "@/lib/ui/confirm-gate";
import type { DestructiveConfirmCopy } from "@/lib/ui/destructive-confirm";
import { mutationNotice, type MutationNoticeCopy } from "@/lib/ui/mutation-notice";
import { notify } from "@/lib/ui/notify";
import type { SecurityActionResult } from "@/types/security-action";

type SecurityActionFormProps = {
  action: (formData: FormData) => Promise<SecurityActionResult>;
  children: ReactNode;
  className?: string;
  confirm?: DestructiveConfirmCopy;
  notice: MutationNoticeCopy;
};

export function SecurityActionForm({
  action,
  children,
  className,
  confirm,
  notice,
}: SecurityActionFormProps) {
  const router = useRouter();
  const pendingRef = useRef(false);
  const queuedFormData = useRef<FormData | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function runMutation(formData: FormData) {
    if (onSafeSubmitAttempt(pendingRef.current) === "block") {
      return;
    }

    pendingRef.current = true;
    setPending(true);

    try {
      const result = await action(formData);
      const next = mutationNotice(result, {
        ...notice,
        successDescription: interpolateDescription(notice.successDescription, formData),
      });
      notify[next.tone]({
        title: next.title,
        description: next.description || undefined,
      });
      if (next.redirectTo) {
        router.push(next.redirectTo);
        return;
      }
      if (next.refresh) {
        router.refresh();
      }
    } catch (error) {
      unstable_rethrow(error);
      notify.error({
        title: notice.errorTitle,
        description: "Something went wrong. Try again.",
      });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <PendingActionProvider pending={pending}>
      <form
        className={className}
        aria-busy={pending}
        action={async (formData) => {
          if (!confirm) {
            await runMutation(formData);
            return;
          }
          if (onDestructiveSubmitAttempt(pendingRef.current) === "block") {
            return;
          }
          queuedFormData.current = formData;
          setConfirmOpen(true);
        }}
      >
        {children}
      </form>
      {confirm ? (
        <ConfirmDialog
          open={confirmOpen}
          title={confirm.title}
          description={confirm.description}
          warning={confirm.warning}
          cancelLabel={confirm.cancelLabel}
          confirmLabel={confirm.confirmLabel}
          confirmPending={pending}
          onCancel={() => {
            if (onConfirmDialogChoice(pendingRef.current, "cancel") === "abort") {
              setConfirmOpen(false);
              queuedFormData.current = null;
            }
          }}
          onConfirm={() => {
            if (onConfirmDialogChoice(pendingRef.current, "confirm") !== "run") {
              return;
            }
            const formData = queuedFormData.current;
            setConfirmOpen(false);
            queuedFormData.current = null;
            if (formData) {
              void runMutation(formData);
            }
          }}
        />
      ) : null}
    </PendingActionProvider>
  );
}

function interpolateDescription(template: string | undefined, formData: FormData | null): string | undefined {
  if (!template) {
    return undefined;
  }
  const name = String(formData?.get("employeeLabel") ?? "").trim() || "The employee";
  return template.replaceAll("{name}", name);
}
