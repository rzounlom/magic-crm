"use client";

import { useEffect, useId, useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  warning?: string;
  cancelLabel?: string;
  confirmLabel: string;
  confirmPending?: boolean;
  confirmPendingLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  warning,
  cancelLabel = "Cancel",
  confirmLabel,
  confirmPending = false,
  confirmPendingLabel = "Working…",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open) {
      const active = document.activeElement;
      previousFocusRef.current = active instanceof HTMLElement ? active : null;
      if (!dialog.open) {
        dialog.showModal();
      }
      cancelRef.current?.focus();
      return;
    }

    if (dialog.open) {
      dialog.close();
    }
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed top-1/2 left-1/2 m-0 max-h-[min(90vh,100%)] w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-foreground/45"
      onCancel={(event) => {
        event.preventDefault();
        if (!confirmPending) {
          onCancel();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !confirmPending) {
          onCancel();
        }
      }}
    >
      <div className="px-5 py-4">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-foreground/80">
          {description}
        </p>
        {warning ? <p className="mt-3 text-sm text-warning">{warning}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            className="cursor-pointer rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed"
            onClick={onCancel}
            disabled={confirmPending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-md bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive disabled:cursor-not-allowed"
            onClick={onConfirm}
            disabled={confirmPending}
          >
            {confirmPending ? confirmPendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
