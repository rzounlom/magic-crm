"use client";

import { useState } from "react";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { hhMmFromMinutes, minutesFromHhMm } from "@/lib/operating-hours/admin-validation";
import { OPERATING_HOURS_EXCEPTION_KINDS } from "@/types/operating-hours";
import type { SecurityActionResult } from "@/types/security-action";

type ExceptionRow = {
  id: string;
  localDate: string;
  kind: string;
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
};

type Props = {
  locationId: string;
  exceptions: ExceptionRow[];
  upsertAction: (formData: FormData) => Promise<SecurityActionResult>;
  deleteAction: (formData: FormData) => Promise<SecurityActionResult>;
};

export function OperatingHoursExceptionForms({
  locationId,
  exceptions,
  upsertAction,
  deleteAction,
}: Props) {
  const [kind, setKind] = useState<string>(OPERATING_HOURS_EXCEPTION_KINDS.CLOSED);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("20:00");

  const startMinute = minutesFromHhMm(start);
  const endMinute = minutesFromHhMm(end);

  return (
    <div className="space-y-6">
      <SecurityActionForm
        action={upsertAction}
        notice={{
          successTitle: "Exception saved",
          errorTitle: "Unable to save hours exception",
        }}
        className="space-y-3 rounded-[var(--radius-control)] border border-border/80 bg-surface p-4"
      >
        <input type="hidden" name="locationId" value={locationId} />
        <input
          type="hidden"
          name="startMinute"
          value={kind === OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM && startMinute != null ? String(startMinute) : ""}
        />
        <input
          type="hidden"
          name="endMinute"
          value={kind === OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM && endMinute != null ? String(endMinute) : ""}
        />
        <p className="text-sm text-muted-foreground">
          Holidays and special dates override the weekly schedule for that civil date. Saving an exception
          returns the policy to DRAFT.
        </p>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Date</span>
            <input
              required
              name="localDate"
              type="date"
              className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Kind</span>
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3"
            >
              <option value={OPERATING_HOURS_EXCEPTION_KINDS.CLOSED}>Closed</option>
              <option value={OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM}>Custom open hours</option>
            </select>
          </label>
          {kind === OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM ? (
            <>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Open</span>
                <input
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                  className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3"
                  placeholder="10:00"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Close</span>
                <input
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                  className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3"
                  placeholder="20:00"
                />
              </label>
            </>
          ) : null}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Note (optional)</span>
          <input
            name="note"
            maxLength={500}
            className="min-h-10 w-full max-w-xl rounded-[var(--radius-control)] border border-border bg-background px-3"
          />
        </label>
        <PendingSubmitButton pendingLabel="Saving…" variant="secondary">
          Save exception
        </PendingSubmitButton>
      </SecurityActionForm>

      {exceptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No date exceptions yet.</p>
      ) : (
        <ul className="space-y-2">
          {exceptions.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border/70 px-3 py-2"
            >
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  {row.localDate} · {row.kind}
                </p>
                <p className="text-muted-foreground">
                  {row.kind === OPERATING_HOURS_EXCEPTION_KINDS.CUSTOM
                    ? `${row.startMinute != null ? hhMmFromMinutes(row.startMinute) : "?"}–${
                        row.endMinute != null ? hhMmFromMinutes(row.endMinute) : "?"
                      }`
                    : "Closed all day"}
                  {row.note ? ` · ${row.note}` : ""}
                </p>
              </div>
              <SecurityActionForm
                action={deleteAction}
                notice={{
                  successTitle: "Exception removed",
                  errorTitle: "Unable to delete hours exception",
                }}
                confirm={{
                  title: "Remove this date exception?",
                  description: "The weekly schedule will apply again for that date after the next verify.",
                  confirmLabel: "Remove",
                }}
              >
                <input type="hidden" name="locationId" value={locationId} />
                <input type="hidden" name="exceptionId" value={row.id} />
                <PendingSubmitButton pendingLabel="Removing…" variant="ghost" size="sm">
                  Remove
                </PendingSubmitButton>
              </SecurityActionForm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
