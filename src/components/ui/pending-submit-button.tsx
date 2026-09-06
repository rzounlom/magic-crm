"use client";

import { createContext, useContext, type ReactNode } from "react";

const PendingActionContext = createContext(false);

export function PendingActionProvider({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return <PendingActionContext.Provider value={pending}>{children}</PendingActionContext.Provider>;
}

export function PendingSubmitButton({
  pendingLabel,
  children,
  className,
}: {
  pendingLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const pending = useContext(PendingActionContext);

  return (
    <button
      type="submit"
      disabled={pending}
      className={`cursor-pointer disabled:cursor-not-allowed ${className ?? ""}`}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
