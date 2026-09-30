import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`status-badge status-badge-${tone}`}>{children}</span>;
}

export function bookingBadgeTone(status: string): BadgeTone {
  if (status === "CONFIRMED") {
    return "success";
  }
  if (status === "PENDING_PAYMENT") {
    return "warning";
  }
  if (status === "CANCELLED") {
    return "danger";
  }
  return "neutral";
}
