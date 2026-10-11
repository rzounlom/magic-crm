import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/ui/cn";

export type BookingReadinessPurpose = "PLACE_HOLD" | "CONFIRM_BOOKING";

export type BookingReadinessTone = "neutral" | "ready" | "warning" | "danger" | "info";

export type BookingReadinessBlocker = {
  code: string;
  message: string;
  overridableWithHoursException: boolean;
};

type BookingReadinessCardProps = {
  id: string;
  purpose: BookingReadinessPurpose;
  title: string;
  headline: string;
  detail: string;
  tone: BookingReadinessTone;
  eventDateLabel: string;
  eventTimeLabel: string;
  locationLabel: string;
  operatingHoursStatus: string;
  blockers: BookingReadinessBlocker[];
  children?: ReactNode;
  headerAside?: ReactNode;
  metaRows?: Array<{ label: string; value: ReactNode }>;
};

const TONE_CLASS: Record<BookingReadinessTone, string> = {
  neutral: "border-border",
  ready: "border-primary/30",
  warning: "border-warning/40",
  danger: "border-destructive/30",
  info: "border-primary/25",
};

const PURPOSE_LABEL: Record<BookingReadinessPurpose, string> = {
  PLACE_HOLD: "Purpose: PLACE_HOLD",
  CONFIRM_BOOKING: "Purpose: CONFIRM_BOOKING",
};

/**
 * Shared presentation for HOLD and confirmation readiness.
 * Domain readiness remains in separate server services — this card only displays them.
 */
export function BookingReadinessCard({
  id,
  purpose,
  title,
  headline,
  detail,
  tone,
  eventDateLabel,
  eventTimeLabel,
  locationLabel,
  operatingHoursStatus,
  blockers,
  children,
  headerAside,
  metaRows = [],
}: BookingReadinessCardProps) {
  return (
    <Card
      id={id}
      variant="flat"
      padding="md"
      className={cn("scroll-mt-[calc(var(--header-offset)+0.75rem)]", TONE_CLASS[tone])}
      data-readiness-purpose={purpose}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{title}</CardTitle>
            <Badge tone={purpose === "PLACE_HOLD" ? "info" : "warning"}>{PURPOSE_LABEL[purpose]}</Badge>
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">{headline}</p>
          <CardDescription>{detail}</CardDescription>
        </div>
        {headerAside ? <div className="shrink-0 text-sm">{headerAside}</div> : null}
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Requested event</dt>
          <dd className="mt-0.5 font-medium">
            {eventDateLabel} · {eventTimeLabel}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Location / time zone</dt>
          <dd className="mt-0.5 font-medium">{locationLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Operating hours</dt>
          <dd className="mt-0.5 font-medium">{operatingHoursStatus}</dd>
        </div>
        {metaRows.map((row) => (
          <div key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="mt-0.5 font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>

      {blockers.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Blocking reasons</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/80">
            {blockers.map((blocker) => (
              <li key={`${blocker.code}:${blocker.message}`}>
                {blocker.message}
                {blocker.overridableWithHoursException ? (
                  <span className="text-muted-foreground"> (hours exception may apply)</span>
                ) : (
                  <span className="text-muted-foreground"> (not overridable by hours exception)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {children}
    </Card>
  );
}

export function readinessToneFromState(kind: "hold" | "confirm", state: string): BookingReadinessTone {
  if (
    state.includes("ALREADY_HELD") ||
    state.includes("ALREADY_CONFIRMED") ||
    state.includes("READY_WITH_EXCEPTION") ||
    state.includes("NEEDS_FINAL_VALIDATION")
  ) {
    return kind === "hold" ? "info" : "ready";
  }
  if (
    state.includes("BLOCKED_RESOURCE") ||
    state.includes("BLOCKED_INVALID") ||
    state.includes("ALREADY_BOOKED")
  ) {
    return "danger";
  }
  if (state.includes("BLOCKED_HOURS") || state.includes("BLOCKED_OUTSIDE")) {
    return "warning";
  }
  return "neutral";
}
