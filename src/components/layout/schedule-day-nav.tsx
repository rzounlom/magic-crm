"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";

import { LoadingIndicator } from "@/components/ui/loading-indicator";

const NAV_BUTTON =
  "rounded-md border border-border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60";

export function ScheduleDayNav({
  date,
  prev,
  next,
  today,
  selectedTypeId,
  types,
}: {
  date: string;
  prev: string;
  next: string;
  today: string;
  selectedTypeId: string | null;
  types: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const typeQuery = selectedTypeId ? `&type=${selectedTypeId}` : "";

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
    const type = String(form.get("type") ?? selectedTypeId ?? "");
    go(`/app/schedule?date=${nextDate}${type ? `&type=${type}` : ""}`);
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <button type="button" disabled={pending} className={NAV_BUTTON} onClick={() => go(`/app/schedule?date=${prev}${typeQuery}`)}>
          Previous day
        </button>
        <button type="button" disabled={pending} className={NAV_BUTTON} onClick={() => go(`/app/schedule?date=${today}${typeQuery}`)}>
          Today
        </button>
        <button type="button" disabled={pending} className={NAV_BUTTON} onClick={() => go(`/app/schedule?date=${next}${typeQuery}`)}>
          Next day
        </button>
        <form className="flex items-end gap-2" onSubmit={onDateSubmit}>
          {selectedTypeId ? <input type="hidden" name="type" value={selectedTypeId} /> : null}
          <label className="text-sm">
            <span className="sr-only">Date</span>
            <input
              type="date"
              name="date"
              defaultValue={date}
              disabled={pending}
              className="rounded-md border border-border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <LoadingIndicator label="Loading…" /> : "Go"}
          </button>
        </form>
        {pending ? <p className="text-xs text-foreground/60">Loading schedule…</p> : null}
      </div>
      {types.length > 0 ? (
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Resource types">
          {types.map((type) => (
            <button
              key={type.id}
              type="button"
              disabled={pending}
              onClick={() => go(`/app/schedule?date=${date}&type=${type.id}`)}
              className={`rounded-md px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                type.id === selectedTypeId ? "bg-primary text-primary-foreground" : "border border-border"
              }`}
            >
              {type.name}
            </button>
          ))}
        </nav>
      ) : null}
    </>
  );
}
