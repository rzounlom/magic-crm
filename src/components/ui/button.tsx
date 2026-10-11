import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:bg-[var(--primary-hover)] disabled:bg-[var(--disabled-background)] disabled:text-[var(--disabled-foreground)]",
  secondary:
    "border border-border bg-surface text-foreground shadow-sm hover:border-primary/40 disabled:text-[var(--disabled-foreground)] disabled:border-[var(--border-subtle)]",
  ghost:
    "bg-transparent text-foreground hover:bg-muted disabled:text-[var(--disabled-foreground)]",
  destructive:
    "border border-destructive/40 bg-surface text-destructive hover:bg-[color-mix(in_srgb,var(--destructive)_8%,white)] disabled:text-[var(--disabled-foreground)]",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-sm",
  md: "min-h-11 px-4 py-2 text-sm",
  lg: "min-h-12 px-5 py-2.5 text-base",
};

export function buttonClassName(options?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  loading?: boolean;
}): string {
  const variant = options?.variant ?? "primary";
  const size = options?.size ?? "md";
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed",
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    options?.loading ? "pointer-events-none" : null,
    options?.className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, className, loading })}
      {...rest}
    >
      {loading ? (loadingLabel ?? "Working…") : children}
    </button>
  );
}

/** Styled Next.js Link using the same visual variants as Button. */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  target,
  rel,
  "aria-current": ariaCurrent,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  target?: string;
  rel?: string;
  "aria-current"?: "page" | "step" | "location" | "date" | "time" | "true" | "false";
}) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      aria-current={ariaCurrent}
      className={buttonClassName({ variant, size, className })}
    >
      {children}
    </Link>
  );
}
