import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type CardVariant = "default" | "flat" | "elevated";

const VARIANT_CLASS: Record<CardVariant, string> = {
  default: "border border-border bg-surface shadow-[var(--shadow-card)]",
  flat: "border border-border-subtle bg-surface",
  elevated: "border border-border bg-surface-elevated shadow-[var(--shadow-card)]",
};

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  padding?: "sm" | "md" | "lg";
  children: ReactNode;
};

const PADDING_CLASS = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
} as const;

export function Card({
  variant = "default",
  padding = "md",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] text-foreground",
        VARIANT_CLASS[variant],
        PADDING_CLASS[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={cn("text-[length:var(--text-title-sm)] font-semibold leading-tight", className)}>{children}</h2>;
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <p className={cn("mt-1 text-sm text-muted-foreground", className)}>{children}</p>;
}
