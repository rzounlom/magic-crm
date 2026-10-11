import { formatEstimatedDepositLine, formatMoneyFromCents } from "@/lib/event-planner/money";
import { cn } from "@/lib/ui/cn";

export type PriceBreakdownProps = {
  currency?: string;
  /** Authoritative estimated total in cents. Omit or null when unresolved. */
  totalCents?: number | null;
  pricingComplete?: boolean;
  guestCount?: number | null;
  perPersonCents?: number | null;
  depositPreviewCents?: number | null;
  depositPreviewPercent?: number | null;
  budgetLine?: string | null;
  className?: string;
  /** Compact for proposal cards; detailed for summaries. */
  density?: "compact" | "comfortable";
};

/**
 * Presentation-only price summary. All amounts must come from authoritative server data.
 * Does not calculate tax, promotions, or payment received.
 */
export function PriceBreakdown({
  currency = "USD",
  totalCents = null,
  pricingComplete = false,
  guestCount = null,
  perPersonCents: perPerson = null,
  depositPreviewCents = null,
  depositPreviewPercent = null,
  budgetLine = null,
  className,
  density = "comfortable",
}: PriceBreakdownProps) {
  const resolved = pricingComplete || (typeof totalCents === "number" && totalCents > 0);
  const totalLabel =
    resolved && typeof totalCents === "number"
      ? formatMoneyFromCents(totalCents, currency)
      : "Pricing to confirm";

  return (
    <div
      className={cn("min-w-0", className)}
      data-price-breakdown
      data-pricing-resolved={resolved ? "true" : "false"}
    >
      <p
        className={cn(
          "font-semibold tracking-tight text-foreground",
          density === "compact" ? "text-2xl" : "text-3xl",
        )}
      >
        {totalLabel}
      </p>
      <p className="mt-0.5 text-xs leading-tight text-muted-foreground">
        Estimated total
        {resolved && perPerson != null && typeof totalCents === "number" && totalCents > 0
          ? ` · ${formatMoneyFromCents(perPerson, currency)} per person`
          : ""}
        {guestCount != null && guestCount > 0 ? ` · based on ${guestCount} guests` : ""}
      </p>
      {!resolved ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Final pricing will be confirmed with the venue. This is not a quote or invoice.
        </p>
      ) : null}
      {budgetLine ? <p className="mt-1 text-xs leading-tight text-foreground/80">{budgetLine}</p> : null}
      {depositPreviewCents != null && pricingComplete ? (
        <p className="mt-1 text-xs leading-tight text-muted-foreground">
          {formatEstimatedDepositLine(depositPreviewCents, depositPreviewPercent, currency)}
        </p>
      ) : null}
      <p className="mt-2 text-[length:var(--text-caption)] text-muted-foreground">
        MagicCRM does not collect payment on this page.
      </p>
    </div>
  );
}
