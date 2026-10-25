"use client";

import { createContext, useContext, type ReactNode } from "react";

import { buttonClassName, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { cn } from "@/lib/ui/cn";

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
  form,
  variant,
  size = "md",
  "aria-label": ariaLabel,
}: {
  pendingLabel: string;
  children: ReactNode;
  className?: string;
  form?: string;
  /** When set, applies shared Button visual styles (opt-in for gradual migration). */
  variant?: ButtonVariant;
  size?: ButtonSize;
  "aria-label"?: string;
}) {
  const pending = useContext(PendingActionContext);

  return (
    <button
      type="submit"
      form={form}
      disabled={pending}
      className={
        variant
          ? buttonClassName({ variant, size, className, loading: pending })
          : cn("cursor-pointer disabled:cursor-not-allowed", className)
      }
      aria-busy={pending}
      aria-label={ariaLabel}
    >
      {pending ? <LoadingIndicator label={pendingLabel} /> : children}
    </button>
  );
}
