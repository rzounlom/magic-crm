import { cn } from "@/lib/ui/cn";

type OrganizationLocationContextProps = {
  organizationName: string | null;
  locationName: string | null;
  className?: string;
};

/**
 * Read-only ambient org/location context for the employee top bar.
 * Not interactive — location switching is out of scope until a domain workflow exists.
 */
export function OrganizationLocationContext({
  organizationName,
  locationName,
  className,
}: OrganizationLocationContextProps) {
  if (!organizationName && !locationName) {
    return null;
  }

  const locationLabel = locationName ?? "No location set";

  return (
    <div
      className={cn("min-w-0 text-left", className)}
      data-employee-context
    >
      {organizationName ? (
        <p className="truncate text-[length:var(--text-label)] font-semibold text-foreground">
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
