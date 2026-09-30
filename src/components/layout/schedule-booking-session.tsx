"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";

import { SecurityActionForm } from "@/components/layout/security-action-form";

export type ScheduleBookingCompletion = "pending" | "confirmed";

const ScheduleBookingSessionContext = createContext<
  ((kind: ScheduleBookingCompletion, message: string) => void) | null
>(null);

export function ScheduleBookingSessionProvider({
  onComplete,
  children,
}: {
  onComplete: (kind: ScheduleBookingCompletion, message: string) => void;
  children: ReactNode;
}) {
  return <ScheduleBookingSessionContext.Provider value={onComplete}>{children}</ScheduleBookingSessionContext.Provider>;
}

export function ScheduleBookingActionForm({
  completeKind,
  ...props
}: ComponentProps<typeof SecurityActionForm> & { completeKind: ScheduleBookingCompletion }) {
  const onComplete = useContext(ScheduleBookingSessionContext);
  return (
    <SecurityActionForm
      {...props}
      onResult={(result) => {
        if (result.ok) {
          onComplete?.(completeKind, result.message ?? "");
        }
      }}
    />
  );
}
