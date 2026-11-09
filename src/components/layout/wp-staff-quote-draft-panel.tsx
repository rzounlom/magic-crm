import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatMoneyFromCents } from "@/lib/event-planner/money";
import { createWpStaffQuoteDraftAction } from "@/server/actions/wp-staff-quote-draft";

type DraftProvenance = {
  pricingSource: string;
  planDate: string;
  subtotalCents: number;
  taxCents: number;
  warnings: string[];
  catalogPriceDiscrepancies: Array<{
    wpKey: string;
    productSlug: string;
    wpCents: number;
    magicCatalogCents: number;
  }>;
};

type DraftPlan = {
  id: string;
  title: string;
  estimatedTotalCents: number | null;
  currency: string;
  availabilityNote: string | null;
  payload: unknown;
};

function money(cents: number, currency = "USD"): string {
  return formatMoneyFromCents(cents, currency);
}

export function WpStaffQuoteDraftPanel({
  inquiryId,
  canManage,
  canCreate,
  draft,
  provenance,
}: {
  inquiryId: string;
  canManage: boolean;
  /** Ready private WP snapshot exists. */
  canCreate: boolean;
  draft: DraftPlan | null;
  provenance: DraftProvenance | null;
}) {
  if (!canManage && !draft) {
    return null;
  }

  return (
    <div
      className="mt-8 rounded-md border border-border px-4 py-4"
      data-wp-staff-quote-draft
    >
      <h2 className="text-sm font-medium text-foreground">Staff quote draft</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Convert the private WordPress calculation into an editable MagiCRM working draft. Nothing is
        emailed or shown to the customer until a later explicit approval step.
      </p>

      {draft && provenance ? (
        <div className="mt-4 space-y-3 text-sm" data-wp-staff-quote-draft-summary>
          <p className="text-2xl font-semibold">{money(draft.estimatedTotalCents ?? 0, draft.currency)}</p>
          <p className="text-xs text-muted-foreground">{draft.title}</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-foreground/60">Pricing source</dt>
              <dd className="mt-0.5">{provenance.pricingSource}</dd>
            </div>
            <div>
              <dt className="text-foreground/60">Plan date</dt>
              <dd className="mt-0.5">{provenance.planDate}</dd>
            </div>
            <div>
              <dt className="text-foreground/60">Subtotal / tax</dt>
              <dd className="mt-0.5">
                {money(provenance.subtotalCents)} + {money(provenance.taxCents)} tax
              </dd>
            </div>
            <div>
              <dt className="text-foreground/60">Availability</dt>
              <dd className="mt-0.5">{draft.availabilityNote ?? "Not checked"}</dd>
            </div>
          </dl>
          {provenance.catalogPriceDiscrepancies.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium">Known MagiCRM catalog discrepancies (WP amounts used)</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {provenance.catalogPriceDiscrepancies.map((row) => (
                  <li key={row.wpKey}>
                    {row.wpKey} → {row.productSlug}: WP {money(row.wpCents)} vs catalog{" "}
                    {money(row.magicCatalogCents)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {provenance.warnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-xs text-foreground/80">
              {provenance.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No staff quote draft yet. Create one after reviewing the private recommendation below.
        </p>
      )}

      {canManage && canCreate ? (
        <SecurityActionForm
          action={createWpStaffQuoteDraftAction}
          className="mt-4"
          notice={{
            successTitle: draft ? "Staff quote draft refreshed" : "Staff quote draft created",
            errorTitle: "Unable to create staff quote draft",
          }}
        >
          <input type="hidden" name="inquiryId" value={inquiryId} />
          <PendingSubmitButton
            pendingLabel={draft ? "Refreshing draft…" : "Creating draft…"}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {draft ? "Refresh draft from private calculation" : "Create staff quote draft"}
          </PendingSubmitButton>
        </SecurityActionForm>
      ) : null}
    </div>
  );
}
