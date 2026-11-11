"use client";

import { cn } from "@/lib/ui/cn";

type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

type ChoiceSegmentProps<T extends string> = {
  name: string;
  legend: string;
  options: readonly ChoiceOption<T>[];
  required?: boolean;
  error?: string;
  value?: T | "";
  onChange?: (value: T) => void;
  columns?: 2 | 3;
  className?: string;
};

/**
 * Accessible radio group rendered as polished choice cards / segmented controls.
 * Keeps native radio inputs for form posts, keyboard, and screen readers.
 */
export function ChoiceSegment<T extends string>({
  name,
  legend,
  options,
  required,
  error,
  value,
  onChange,
  columns = 2,
  className,
}: ChoiceSegmentProps<T>) {
  return (
    <fieldset className={cn("min-w-0 space-y-2.5", className)}>
      <legend className="text-[length:var(--text-label)] font-semibold text-foreground">
        {legend}
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </legend>
      <div
        className={cn(
          "grid gap-2",
          columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        )}
        role="presentation"
      >
        {options.map((option) => {
          const selected = value === option.value;
          const controlled = onChange != null;
          return (
            <label
              key={option.value}
              className={cn(
                "group relative flex min-h-[var(--control-height)] cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2.5 text-sm transition",
                "border-border bg-surface hover:border-primary/40 hover:bg-primary/[0.03]",
                "has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06] has-[:checked]:shadow-[var(--shadow-card)]",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                selected && controlled ? "border-primary bg-primary/[0.06] shadow-[var(--shadow-card)]" : null,
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                required={required}
                className="peer sr-only"
                {...(controlled
                  ? {
                      checked: selected,
                      onChange: () => onChange(option.value),
                    }
                  : {})}
              />
              <span
                aria-hidden
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-background",
                  "peer-checked:border-primary peer-checked:bg-primary",
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground opacity-0 peer-checked:opacity-100" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{option.label}</span>
                {option.hint ? (
                  <span className="mt-0.5 block text-[length:var(--text-caption)] text-muted-foreground">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p className="text-[length:var(--text-caption)] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
