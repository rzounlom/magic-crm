import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatMoneyFromCents } from "@/lib/event-planner/money";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import {
  approveAndSendWpStaffQuoteAction,
  checkWpStaffQuoteAvailabilityAction,
  createWpStaffQuoteDraftAction,
  updateWpStaffQuoteDraftAction,
} from "@/server/actions/wp-staff-quote-draft";

type DraftProvenance = {
  pricingSource: string;
  planDate: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  originalTotalCents?: number;
  warnings: string[];
  catalogPriceDiscrepancies: Array<{
    wpKey: string;
    productSlug: string;
    wpCents: number;
    magicCatalogCents: number;
  }>;
  staffEdit?: {
    editedAt: string;
    reason: string;
    wordpressParityExact: false;
  };
  employeeApproval?: {
    approvedAt: string;
    deliveryCompleted: boolean;
    deliveryBlockedCode: string | null;
    deliveryBlockedMessage: string | null;
  };
};

type DraftPlan = {
  id: string;
  title: string;
  estimatedTotalCents: number | null;
  currency: string;
  availabilityNote: string | null;
  availabilityStatus?: string | null;
  guestCount?: number | null;
  durationMinutes?: number | null;
  payload: unknown;
};

type DeliveryPolicy = {
  canPreview: boolean;
  canApprove: boolean;
  canDeliver: boolean;
  code: string;
  message: string;
};

function money(cents: number, currency = "USD"): string {
  return formatMoneyFromCents(cents, currency);
}

export function WpStaffQuoteDraftPanel({
  inquiryId,
  canManage,
  canApproveQuotes,
  canOverrideQuotePricing,
  canCreate,
  draft,
  provenance,
  deliveryPolicy,
  customerEmail,
}: {
  inquiryId: string;
  canManage: boolean;
  canApproveQuotes: boolean;
  canOverrideQuotePricing: boolean;
  /** Ready private WP snapshot exists. */
  canCreate: boolean;
  draft: DraftPlan | null;
  provenance: DraftProvenance | null;
  deliveryPolicy: DeliveryPolicy | null;
  customerEmail: string | null;
}) {
  if (!canManage && !draft) {
    return null;
  }

  const payload = draft ? readEventPlanPayload(draft.payload) : null;
  const lineItems = payload?.lineItems ?? [];

  return (
    <div
      className="mt-8 rounded-md border border-border px-4 py-4"
      data-wp-staff-quote-draft
    >
      <h2 className="text-sm font-medium text-foreground">Staff quote draft</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Convert the private WordPress calculation into an editable MagiCRM working draft. Customer
        delivery requires explicit employee approval and pricing verification policy clearance.
      </p>

      {deliveryPolicy ? (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-xs ${
            deliveryPolicy.canDeliver
              ? "border-emerald-500/40 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
          }`}
          data-wp-quote-delivery-policy={deliveryPolicy.code}
        >
          <p className="font-medium">
            {deliveryPolicy.canDeliver
              ? "Customer delivery allowed (tenant_live verified)"
              : "Customer delivery gated"}
          </p>
          <p className="mt-0.5">{deliveryPolicy.message}</p>
        </div>
      ) : null}

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
              <dd className="mt-0.5">
                {draft.availabilityStatus ?? "NOT_VALIDATED"}
                {draft.availabilityNote ? ` · ${draft.availabilityNote}` : ""}
              </dd>
            </div>
          </dl>
          {typeof provenance.originalTotalCents === "number" &&
          provenance.originalTotalCents !== provenance.totalCents ? (
            <p className="text-xs text-amber-800 dark:text-amber-100">
              Original WordPress total was {money(provenance.originalTotalCents)}. Staff edits changed
              the quote — exact WP calculation parity is no longer claimed.
            </p>
          ) : null}
          {provenance.staffEdit ? (
            <p className="text-xs text-muted-foreground">
              Last edit: {provenance.staffEdit.reason} ({provenance.staffEdit.editedAt})
            </p>
          ) : null}
          {provenance.employeeApproval ? (
            <div className="rounded-md border border-border px-3 py-2 text-xs" data-wp-quote-approval>
              <p className="font-medium">
                Approved {provenance.employeeApproval.approvedAt}
                {provenance.employeeApproval.deliveryCompleted ? " · delivered" : " · not delivered"}
              </p>
              {provenance.employeeApproval.deliveryBlockedMessage ? (
                <p className="mt-0.5">{provenance.employeeApproval.deliveryBlockedMessage}</p>
              ) : null}
            </div>
          ) : null}
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

          {canManage ? (
            <div className="space-y-6 border-t border-border pt-4">
              <SecurityActionForm
                action={updateWpStaffQuoteDraftAction}
                className="space-y-3"
                notice={{
                  successTitle: "Staff quote draft updated",
                  errorTitle: "Unable to update staff quote draft",
                }}
              >
                <input type="hidden" name="inquiryId" value={inquiryId} />
                <input type="hidden" name="lineCount" value={lineItems.length} />
                <p className="text-sm font-medium">Edit draft (no MagiCRM catalog reprice)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs">
                    <span className="text-foreground/70">Guests</span>
                    <input
                      type="number"
                      name="guestCount"
                      min={1}
                      required
                      defaultValue={payload?.guestCount || draft.guestCount || 1}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="text-foreground/70">Duration (minutes)</span>
                    <input
                      type="number"
                      name="durationMinutes"
                      min={30}
                      step={15}
                      required
                      defaultValue={payload?.durationMinutes || draft.durationMinutes || 120}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="text-foreground/70">Event date</span>
                    <input
                      type="date"
                      name="eventDate"
                      defaultValue={payload?.eventDate ?? ""}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="text-foreground/70">Start time</span>
                    <input
                      type="time"
                      name="startTime"
                      defaultValue={payload?.startTime ?? ""}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="space-y-2" data-wp-quote-line-editor>
                  {lineItems.map((item, index) => (
                    <div
                      key={`${item.slug}-${index}`}
                      className="grid gap-2 rounded-md border border-border/70 px-3 py-2 sm:grid-cols-4"
                    >
                      <input type="hidden" name={`lineSlug_${index}`} value={item.slug} />
                      <input type="hidden" name={`lineKind_${index}`} value={item.kind} />
                      <label className="block text-xs sm:col-span-2">
                        <span className="text-foreground/70">Item</span>
                        <input
                          name={`lineName_${index}`}
                          defaultValue={item.name}
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="text-foreground/70">Qty</span>
                        <input
                          type="number"
                          name={`lineQty_${index}`}
                          min={1}
                          defaultValue={item.quantity}
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="text-foreground/70">Unit cents</span>
                        <input
                          type="number"
                          name={`lineUnitCents_${index}`}
                          defaultValue={item.unitPriceCents}
                          readOnly={!canOverrideQuotePricing}
                          title={
                            canOverrideQuotePricing
                              ? undefined
                              : "Pricing overrides require crm.quotes.price_override"
                          }
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm read-only:bg-muted/40"
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <label className="block text-xs">
                  <span className="text-foreground/70">Adjustment note (optional)</span>
                  <textarea
                    name="adjustmentNote"
                    rows={2}
                    defaultValue={payload?.adjustmentNote ?? ""}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-foreground/70">Reason for edit (required)</span>
                  <input
                    name="editReason"
                    required
                    minLength={3}
                    placeholder="e.g. Customer asked to drop arcade"
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <PendingSubmitButton
                  pendingLabel="Saving edits…"
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium"
                >
                  Save staff edits
                </PendingSubmitButton>
              </SecurityActionForm>

              <div className="flex flex-wrap gap-3">
                <SecurityActionForm
                  action={checkWpStaffQuoteAvailabilityAction}
                  notice={{
                    successTitle: "Availability checked",
                    errorTitle: "Unable to check availability",
                  }}
                >
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <PendingSubmitButton
                    pendingLabel="Checking…"
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium"
                  >
                    Check availability
                  </PendingSubmitButton>
                </SecurityActionForm>
              </div>

              {deliveryPolicy?.canApprove && canApproveQuotes ? (
                <SecurityActionForm
                  action={approveAndSendWpStaffQuoteAction}
                  className="space-y-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-3"
                  notice={{
                    successTitle: "Quote approval recorded",
                    errorTitle: "Unable to approve quote",
                  }}
                >
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <p className="text-sm font-medium">Approve and send quote</p>
                  <p className="text-xs text-muted-foreground">
                    Customer: {customerEmail || "missing email"}
                    {deliveryPolicy.canDeliver
                      ? ". Will publish a single customer quote (not Good/Recommended/Premium)."
                      : ". Approval will be recorded; customer delivery remains blocked by pricing policy."}
                  </p>
                  <label className="block text-xs">
                    <span className="text-foreground/70">Approval note (optional)</span>
                    <input
                      name="approvalNote"
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <PendingSubmitButton
                    pendingLabel="Approving…"
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    {deliveryPolicy.canDeliver
                      ? "Approve and send quote"
                      : "Approve quote (delivery gated)"}
                  </PendingSubmitButton>
                </SecurityActionForm>
              ) : null}
              {deliveryPolicy?.canApprove && canManage && !canApproveQuotes ? (
                <p className="text-xs text-muted-foreground" data-wp-quote-approve-denied>
                  Approval requires the Event Sales (or admin) quote approval permission.
                </p>
              ) : null}

              {deliveryPolicy?.canPreview && payload ? (
                <details className="rounded-md border border-dashed border-border px-3 py-3" data-wp-customer-quote-preview>
                  <summary className="cursor-pointer text-sm font-medium">Customer quote preview</summary>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Staff-only preview. Internal warnings and pricing-source metadata are hidden from
                    customers.
                  </p>
                  <p className="mt-3 text-lg font-semibold">
                    {money(draft.estimatedTotalCents ?? 0, draft.currency)}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {lineItems.map((item, index) => (
                      <li key={`${item.slug}-${index}-preview`} className="flex justify-between gap-3">
                        <span>
                          {item.name}
                          {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                        </span>
                        <span>{money(item.totalCents, draft.currency)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
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
