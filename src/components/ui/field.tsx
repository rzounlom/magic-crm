"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";

import { cn } from "@/lib/ui/cn";

const CONTROL_CLASS =
  "w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-[var(--disabled-background)] disabled:text-[var(--disabled-foreground)]";

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  const autoId = useId();
  const controlId = htmlFor ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={controlId} className="block text-[length:var(--text-label)] font-semibold text-foreground">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && !error ? (
        <p id={hintId} className="mt-1.5 text-[length:var(--text-caption)] text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-[length:var(--text-caption)] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Shared class for native inputs used outside Field when needed. */
export function controlClassName(className?: string): string {
  return cn(CONTROL_CLASS, "min-h-[var(--control-height)]", className);
}

export type FieldInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function FieldInput({ label, hint, error, required, id, className, ...rest }: FieldInputProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const describedBy = [hint && !error ? `${controlId}-hint` : null, error ? `${controlId}-error` : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={controlId}>
      <input
        id={controlId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={controlClassName(className)}
        {...rest}
      />
    </Field>
  );
}

export type FieldTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function FieldTextarea({
  label,
  hint,
  error,
  required,
  id,
  className,
  ...rest
}: FieldTextareaProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const describedBy = [hint && !error ? `${controlId}-hint` : null, error ? `${controlId}-error` : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={controlId}>
      <textarea
        id={controlId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(CONTROL_CLASS, "min-h-24", className)}
        {...rest}
      />
    </Field>
  );
}

export type FieldSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function FieldSelect({
  label,
  hint,
  error,
  required,
  id,
  className,
  children,
  ...rest
}: FieldSelectProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const describedBy = [hint && !error ? `${controlId}-hint` : null, error ? `${controlId}-error` : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={controlId}>
      <select
        id={controlId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={controlClassName(className)}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
}
