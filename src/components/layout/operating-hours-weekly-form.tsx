"use client";

import { useMemo, useState } from "react";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { Button } from "@/components/ui/button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  DAY_OF_WEEK_LABELS,
  hhMmFromMinutes,
  minutesFromHhMm,
} from "@/lib/operating-hours/admin-validation";
import type { SecurityActionResult } from "@/types/security-action";

type WindowRow = {
  key: string;
  dayOfWeek: number;
  start: string;
  end: string;
};

type OperatingHoursWeeklyFormProps = {
  locationId: string;
  timezone: string;
  initialWindows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  action: (formData: FormData) => Promise<SecurityActionResult>;
};

function newKey(): string {
  return crypto.randomUUID();
}

export function OperatingHoursWeeklyForm({
  locationId,
  timezone,
  initialWindows,
  action,
}: OperatingHoursWeeklyFormProps) {
  const [rows, setRows] = useState<WindowRow[]>(() =>
    initialWindows.map((row) => ({
      key: newKey(),
      dayOfWeek: row.dayOfWeek,
      start: hhMmFromMinutes(row.startMinute),
      end: hhMmFromMinutes(row.endMinute),
    })),
  );

  const windowsJson = useMemo(() => {
    const parsed = rows
      .map((row) => {
        const startMinute = minutesFromHhMm(row.start);
        const endMinute = minutesFromHhMm(row.end);
        if (startMinute == null || endMinute == null) {
          return null;
        }
        return { dayOfWeek: row.dayOfWeek, startMinute, endMinute };
      })
      .filter((row): row is { dayOfWeek: number; startMinute: number; endMinute: number } => row != null);
    return JSON.stringify(parsed);
  }, [rows]);

  return (
    <SecurityActionForm
      action={action}
      notice={{
        successTitle: "Draft hours saved",
        errorTitle: "Unable to save weekly hours",
      }}
      className="space-y-4"
    >
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="windowsJson" value={windowsJson} />
      <p className="text-sm text-muted-foreground">
        Times are venue-local ({timezone}). Overnight closes may use hours past 24:00 (for example 26:00 =
        2:00 next day). Days with no windows are closed.
      </p>
      <ul className="space-y-3">
        {DAY_OF_WEEK_LABELS.map((label, dayOfWeek) => {
          const dayRows = rows.filter((row) => row.dayOfWeek === dayOfWeek);
          return (
            <li
              key={label}
              className="rounded-[var(--radius-control)] border border-border/80 bg-surface px-3 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">{label}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setRows((current) => [
                      ...current,
                      { key: newKey(), dayOfWeek, start: "10:00", end: "20:00" },
                    ])
                  }
                >
                  Add window
                </Button>
              </div>
              {dayRows.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Closed</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {dayRows.map((row) => (
                    <li key={row.key} className="flex flex-wrap items-end gap-2">
                      <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">Open</span>
                        <input
                          className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3"
                          value={row.start}
                          onChange={(event) =>
                            setRows((current) =>
                              current.map((entry) =>
                                entry.key === row.key ? { ...entry, start: event.target.value } : entry,
                              ),
                            )
                          }
                          placeholder="10:00"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">Close</span>
                        <input
                          className="min-h-10 rounded-[var(--radius-control)] border border-border bg-background px-3"
                          value={row.end}
                          onChange={(event) =>
                            setRows((current) =>
                              current.map((entry) =>
                                entry.key === row.key ? { ...entry, end: event.target.value } : entry,
                              ),
                            )
                          }
                          placeholder="22:00"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <PendingSubmitButton pendingLabel="Saving draft…">Save as draft</PendingSubmitButton>
    </SecurityActionForm>
  );
}
