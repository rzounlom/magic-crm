import { cn } from "@/lib/ui/cn";

type EmployeeContextChipProps = {
  organizationName: string | null;
  locationName: string | null;
  className?: string;
  /** Compact single-line treatment for narrow headers. */
  compact?: boolean;
};

/**
 * Read-only org/location context from trusted server chrome.
 * Not a location switcher — switching is out of scope until a domain workflow exists.
 */
export function EmployeeContextChip({
  organizationName,
  locationName,
  className,
  compact = false,
}: EmployeeContextChipProps) {
  if (!organizationName && !locationName) {
    return null;
  }

  const locationLabel = locationName ?? "No location set";

  return (
    <div
      className={cn(
        "min-w-0 rounded-[var(--radius-control)] border border-border-subtle bg-surface px-2.5 py-1.5 text-left",
        compact ? "max-w-[9.5rem] sm:max-w-[14rem]" : "max-w-[16rem]",
        className,
      )}
      data-employee-context
    >
      {organizationName ? (
        <p className="truncate text-[length:var(--text-caption)] font-semibold text-foreground">
          {organizationName}
        </p>
      ) : null}
      <p
        className={cn(
          "truncate text-[length:var(--text-caption)] text-muted-foreground",
          organizationName ? "mt-0.5" : null,
        )}
        title={locationLabel}
      >
        {locationLabel}
      </p>
    </div>
  );
}
