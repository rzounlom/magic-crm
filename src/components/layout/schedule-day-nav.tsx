"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";

import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { SCHEDULE_FOCUS_ALL } from "@/lib/resources/schedule-board";

const NAV_BUTTON =
  "cursor-pointer rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-60";

export function ScheduleDayNav({
  date,
  prev,
  next,
  today,
  focus,
}: {
  date: string;
  prev: string;
  next: string;
  today: string;
  focus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const prominent = formatScheduleDate(date);

  function hrefFor(nextDate: string) {
    const params = new URLSearchParams({ date: nextDate });
    if (focus && focus !== SCHEDULE_FOCUS_ALL) {
      params.set("focus", focus);
    }
    return `/app/schedule?${params.toString()}`;
  }

  function go(href: string) {
    if (pending) {
      return;
    }
    startTransition(() => {
      router.push(href);
    });
  }

  function onDateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const nextDate = String(form.get("date") ?? date);
    go(hrefFor(nextDate));
  }

  return (
    <div className="mt-5">
      <p className="text-lg font-semibold text-foreground">{prominent}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <button type="button" disabled={pending} className={NAV_BUTTON} onClick={() => go(hrefFor(prev))}>
          Previous day
        </button>
        <button type="button" disabled={pending} className={NAV_BUTTON} onClick={() => go(hrefFor(today))}>
          Today
        </button>
        <button type="button" disabled={pending} className={NAV_BUTTON} onClick={() => go(hrefFor(next))}>
          Next day
        </button>
        <form className="flex items-end gap-2" onSubmit={onDateSubmit}>
          <label className="text-sm">
            <span className="sr-only">Date</span>
            <input
              type="date"
              name="date"
              defaultValue={date}
              disabled={pending}
              className="cursor-pointer rounded-md border border-border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <LoadingIndicator label="Loading…" /> : "Go"}
          </button>
        </form>
        {pending ? <p className="text-xs text-foreground/60">Loading schedule…</p> : null}
      </div>
    </div>
  );
}

function formatScheduleDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
