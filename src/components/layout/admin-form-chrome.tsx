import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/ui/cn";

/** Consistent back link for admin detail / create pages. */
export function AdminBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      {children}
    </Link>
  );
}

/** Section heading inside a long admin page (h2). */
export function AdminSectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[length:var(--text-title-sm)] font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Card shell for grouped admin form fields. */
export function AdminFormSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card variant="flat" padding="md" className={cn("space-y-4", className)} data-admin-form-section>
      {title ? <CardTitle>{title}</CardTitle> : null}
      {description ? <CardDescription className={title ? undefined : "mt-0"}>{description}</CardDescription> : null}
      <div className={cn(title || description ? "space-y-4" : undefined)}>{children}</div>
    </Card>
  );
}

/** Primary / secondary action row for forms. */
export function FormActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-border pt-4",
        className,
      )}
      data-form-action-bar
    >
      {children}
    </div>
  );
}

/** Checkbox row with clear selected affordance (not color-only). */
export function AdminChoiceRow({
  children,
  className,
  selected,
}: {
  children: ReactNode;
  className?: string;
  /** When known at render time (e.g. defaultChecked); CSS :has also covers interaction. */
  selected?: boolean;
}) {
  return (
    <div
      data-admin-choice-row
      data-selected={selected ? "true" : undefined}
      className={cn(
        "rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2.5 text-sm transition-colors",
        "has-[:checked]:border-primary has-[:checked]:bg-primary/5",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
        selected ? "border-primary bg-primary/5" : null,
        className,
      )}
    >
      {children}
    </div>
  );
}
