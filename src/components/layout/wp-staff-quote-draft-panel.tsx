import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { employeePricingSourceLabel } from "@/lib/event-planner/employee-pricing-copy";
import { centsToDollarInputValue, formatMoneyFromCents } from "@/lib/event-planner/money";
import { readEventPlanPayload } from "@/lib/event-planner/payload";
import {
  approveAndSendWpStaffQuoteAction,
  checkWpStaffQuoteAvailabilityAction,
  createWpStaffQuoteDraftAction,
  updateWpStaffQuoteDraftAction,
} from "@/server/actions/wp-staff-quote-draft";
import {
  PLAN_AVAILABILITY_STATUS_LABELS,
  PLAN_AVAILABILITY_STATUSES,
} from "@/types/resource-schedule";

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

function availabilityLabel(draft: DraftPlan): string {
  if (draft.availabilityStatus && draft.availabilityStatus in PLAN_AVAILABILITY_STATUS_LABELS) {
    return PLAN_AVAILABILITY_STATUS_LABELS[
      draft.availabilityStatus as keyof typeof PLAN_AVAILABILITY_STATUS_LABELS
    ];
  }
  if (draft.availabilityStatus) {
    return String(draft.availabilityStatus);
  }
  return PLAN_AVAILABILITY_STATUS_LABELS[PLAN_AVAILABILITY_STATUSES.NOT_VALIDATED];
}

function StageHeading({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <header className="min-w-0">
      <p className="text-[length:var(--text-caption)] font-medium uppercase tracking-wide text-muted-foreground">
        Step {step}
      </p>
      <h3 className="mt-0.5 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </header>
  );
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
  // Catalog discrepancies stay visible above; fold only secondary metadata here.
  const hasTechnicalDetails =
    Boolean(provenance) &&
    (Boolean(provenance?.staffEdit) ||
      provenance!.warnings.length > 0 ||
      (typeof provenance!.originalTotalCents === "number" &&
        provenance!.originalTotalCents !== provenance!.totalCents) ||
      Boolean(provenance!.planDate));

  return (
    <div
      className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4 shadow-sm"
      data-wp-staff-quote-draft
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-base font-semibold text-foreground">Staff quote</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prepare an internal working quote, check availability, then approve for staff records.
            Approval does not email the customer.
          </p>
        </div>
        {canManage && canCreate ? (
          <SecurityActionForm
            action={createWpStaffQuoteDraftAction}
            className="shrink-0"
            confirm={
              draft
                ? {
                    title: "Refresh draft from private calculation?",
                    description:
                      "This replaces the current staff draft with a new draft from the private WordPress estimate.",
                    warning: "Unsaved staff edits and prior staff amounts on this draft will be discarded.",
                    confirmLabel: "Refresh draft",
                    confirmPendingLabel: "Refreshing draft…",
                    cancelLabel: "Keep current draft",
                  }
                : undefined
            }
            notice={{
              successTitle: draft ? "Staff quote draft refreshed" : "Staff quote draft created",
              errorTitle: "Unable to create staff quote draft",
            }}
          >
            <input type="hidden" name="inquiryId" value={inquiryId} />
            <PendingSubmitButton
              pendingLabel={draft ? "Refreshing draft…" : "Creating draft…"}
              variant={draft ? "secondary" : "primary"}
              size="sm"
            >
              {draft ? "Refresh draft from private calculation" : "Create staff quote draft"}
            </PendingSubmitButton>
          </SecurityActionForm>
        ) : null}
      </div>

      {deliveryPolicy ? (
        <div
          className={`mt-4 rounded-md border px-3 py-2.5 text-sm ${
            deliveryPolicy.canDeliver
              ? "border-emerald-500/40 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
          }`}
          data-wp-quote-delivery-policy={deliveryPolicy.code}
        >
          <p className="font-semibold">
            {deliveryPolicy.canDeliver
              ? "Customer email delivery available"
              : "Customer email delivery unavailable"}
          </p>
          <p className="mt-1 text-xs leading-relaxed opacity-95">{deliveryPolicy.message}</p>
        </div>
      ) : null}

      {draft && provenance ? (
        <div className="mt-5 space-y-6" data-wp-staff-quote-draft-summary>
          {/* Stage 1 — Quote summary */}
          <section className="space-y-3" aria-labelledby="wp-quote-stage-summary">
            <StageHeading
              step={1}
              title="Quote summary"
              description="Current staff draft total and readiness signals."
            />
            <div className="rounded-md border border-border-subtle bg-muted/20 px-4 py-3">
              <p
                id="wp-quote-stage-summary"
                className="text-3xl font-semibold tracking-tight text-foreground"
              >
                {money(draft.estimatedTotalCents ?? 0, draft.currency)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{draft.title}</p>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-foreground/60">Subtotal / tax</dt>
                  <dd className="mt-0.5 font-medium">
                    {money(provenance.subtotalCents)} + {money(provenance.taxCents)} tax
                  </dd>
                </div>
                <div>
                  <dt className="text-foreground/60">Availability</dt>
                  <dd className="mt-0.5 font-medium">
                    {availabilityLabel(draft)}
                    {draft.availabilityNote ? (
                      <span className="block font-normal text-muted-foreground">
                        {draft.availabilityNote}
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-foreground/60">Pricing source</dt>
                  <dd className="mt-0.5 font-medium">
                    {employeePricingSourceLabel(provenance.pricingSource)}
                  </dd>
                </div>
              </dl>
            </div>

            {provenance.employeeApproval ? (
              <div className="rounded-md border border-border px-3 py-2 text-xs" data-wp-quote-approval>
                <p className="font-medium">
                  Approved {provenance.employeeApproval.approvedAt}
                  {provenance.employeeApproval.deliveryCompleted ? " · delivered" : " · not delivered"}
                </p>
                {provenance.employeeApproval.deliveryBlockedMessage ? (
                  <p className="mt-0.5 text-muted-foreground">
                    {provenance.employeeApproval.deliveryBlockedMessage}
                  </p>
                ) : null}
              </div>
            ) : null}

            {provenance.catalogPriceDiscrepancies.length > 0 ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-medium">Pricing-source discrepancies (WordPress amounts used)</p>
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

            {hasTechnicalDetails ? (
              <details className="rounded-md border border-dashed border-border px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium text-foreground">
                  Technical details
                </summary>
                <div className="mt-2 space-y-2 text-muted-foreground">
                  <p>Plan date: {provenance.planDate}</p>
                  {typeof provenance.originalTotalCents === "number" &&
                  provenance.originalTotalCents !== provenance.totalCents ? (
                    <p>
                      Original WordPress total was {money(provenance.originalTotalCents)}. Staff
                      edits changed the quote — exact WP calculation parity is no longer claimed.
                    </p>
                  ) : null}
                  {provenance.staffEdit ? (
                    <p>
                      Last edit: {provenance.staffEdit.reason} ({provenance.staffEdit.editedAt})
                    </p>
                  ) : null}
                  {provenance.warnings.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-4 text-foreground/80">
                      {provenance.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            ) : null}
          </section>

          {canManage ? (
            <>
              {/* Stage 2 — Edit draft */}
              <section
                className="space-y-3 border-t border-border pt-5"
                aria-labelledby="wp-quote-stage-edit"
              >
                <StageHeading
                  step={2}
                  title="Edit draft"
                  description="Adjust guests, timing, quantities, and permitted unit prices. Saved as integer cents."
                />
                <SecurityActionForm
                  action={updateWpStaffQuoteDraftAction}
                  className="space-y-4"
                  notice={{
                    successTitle: "Staff quote draft updated",
                    errorTitle: "Unable to update staff quote draft",
                  }}
                >
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <input type="hidden" name="lineCount" value={lineItems.length} />
                  <h4 id="wp-quote-stage-edit" className="sr-only">
                    Edit draft
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="font-medium text-foreground">Guests</span>
                      <input
                        type="number"
                        name="guestCount"
                        min={1}
                        required
                        defaultValue={payload?.guestCount || draft.guestCount || 1}
                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-foreground">Duration (minutes)</span>
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
                    <label className="block text-sm">
                      <span className="font-medium text-foreground">Event date</span>
                      <input
                        type="date"
                        name="eventDate"
                        defaultValue={payload?.eventDate ?? ""}
                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-foreground">Start time</span>
                      <input
                        type="time"
                        name="startTime"
                        defaultValue={payload?.startTime ?? ""}
                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="space-y-3" data-wp-quote-line-editor>
                    <p className="text-sm font-medium text-foreground">Line items</p>
                    {lineItems.map((item, index) => (
                      <div
                        key={`${item.slug}-${index}`}
                        className="grid gap-3 rounded-md border border-border/70 bg-background/60 px-3 py-3 sm:grid-cols-12 sm:items-end"
                      >
                        <input type="hidden" name={`lineSlug_${index}`} value={item.slug} />
                        <input type="hidden" name={`lineKind_${index}`} value={item.kind} />
                        <label className="block text-sm sm:col-span-6">
                          <span className="font-medium text-foreground">Item</span>
                          <input
                            name={`lineName_${index}`}
                            defaultValue={item.name}
                            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-sm sm:col-span-2">
                          <span className="font-medium text-foreground">Quantity</span>
                          <input
                            type="number"
                            name={`lineQty_${index}`}
                            min={1}
                            defaultValue={item.quantity}
                            aria-label={`Quantity for ${item.name}`}
                            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-sm sm:col-span-4">
                          <span className="font-medium text-foreground">Unit price ($)</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            name={`lineUnitPriceDollars_${index}`}
                            defaultValue={centsToDollarInputValue(item.unitPriceCents)}
                            readOnly={!canOverrideQuotePricing}
                            aria-readonly={!canOverrideQuotePricing}
                            aria-label={`Unit price in dollars for ${item.name}`}
                            title={
                              canOverrideQuotePricing
                                ? "Enter dollars, for example 49.99"
                                : "Unit prices are locked for your role. Ask an administrator if a price change is needed."
                            }
                            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums read-only:bg-muted/40"
                          />
                          {!canOverrideQuotePricing ? (
                            <span className="mt-1 block text-[length:var(--text-caption)] text-muted-foreground">
                              Price locked — your role cannot override unit prices.
                            </span>
                          ) : (
                            <span className="mt-1 block text-[length:var(--text-caption)] text-muted-foreground">
                              Stored as integer cents (e.g. 49.99 → 4999¢).
                            </span>
                          )}
                        </label>
                      </div>
                    ))}
                  </div>

                  <label className="block text-sm">
                    <span className="font-medium text-foreground">Adjustment note (optional)</span>
                    <textarea
                      name="adjustmentNote"
                      rows={2}
                      defaultValue={payload?.adjustmentNote ?? ""}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="rounded-md border border-border bg-muted/30 px-3 py-3">
                    <label className="block text-sm">
                      <span className="font-semibold text-foreground">
                        Reason for edit <span className="text-destructive">(required)</span>
                      </span>
                      <input
                        name="editReason"
                        required
                        minLength={3}
                        placeholder="e.g. Customer asked to drop arcade"
                        aria-required="true"
                        className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <p className="mt-1.5 text-[length:var(--text-caption)] text-muted-foreground">
                      Explain why this draft changed. Required before save.
                    </p>
                  </div>

                  <PendingSubmitButton
                    pendingLabel="Saving edits…"
                    variant="secondary"
                  >
                    Save staff edits
                  </PendingSubmitButton>
                </SecurityActionForm>
              </section>

              {/* Stage 3 — Check availability */}
              <section
                className="space-y-3 border-t border-border pt-5"
                aria-labelledby="wp-quote-stage-availability"
              >
                <StageHeading
                  step={3}
                  title="Check availability"
                  description="Revalidate rooms and lanes for the draft date and time. Does not place a HOLD or confirm a booking."
                />
                <p id="wp-quote-stage-availability" className="sr-only">
                  Check availability
                </p>
                <SecurityActionForm
                  action={checkWpStaffQuoteAvailabilityAction}
                  notice={{
                    successTitle: "Availability checked",
                    errorTitle: "Unable to check availability",
                  }}
                >
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <PendingSubmitButton pendingLabel="Checking…" variant="secondary">
                    Check availability
                  </PendingSubmitButton>
                </SecurityActionForm>
              </section>

              {/* Stage 4 — Approve internal quote */}
              <section
                className="space-y-3 border-t border-border pt-5"
                aria-labelledby="wp-quote-stage-approve"
              >
                <StageHeading
                  step={4}
                  title="Approve internal quote"
                  description={
                    deliveryPolicy?.canDeliver
                      ? "Record approval and send the customer quote when delivery is enabled."
                      : "Record a staff-ready quote only. Customer delivery stays blocked until live venue prices are verified."
                  }
                />
                <p id="wp-quote-stage-approve" className="sr-only">
                  Approve internal quote
                </p>

                {deliveryPolicy?.canApprove && canApproveQuotes ? (
                  <SecurityActionForm
                    action={approveAndSendWpStaffQuoteAction}
                    className="space-y-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-4"
                    notice={{
                      successTitle: "Quote approval recorded",
                      errorTitle: "Unable to approve quote",
                    }}
                  >
                    <input type="hidden" name="inquiryId" value={inquiryId} />
                    <p className="text-sm font-semibold text-foreground">
                      {deliveryPolicy.canDeliver
                        ? "Approve and send quote"
                        : "Approve internal quote"}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Customer: {customerEmail || "missing email"}
                      {deliveryPolicy.canDeliver
                        ? ". Will publish a single customer quote (not Good/Recommended/Premium)."
                        : ". This action does not email the customer. Delivery remains blocked by pricing policy."}
                    </p>
                    <label className="block text-sm">
                      <span className="font-medium text-foreground">Approval note (optional)</span>
                      <input
                        name="approvalNote"
                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <PendingSubmitButton pendingLabel="Approving…" variant="primary">
                      {deliveryPolicy.canDeliver
                        ? "Approve and send quote"
                        : "Approve internal quote"}
                    </PendingSubmitButton>
                  </SecurityActionForm>
                ) : null}

                {deliveryPolicy?.canApprove && canManage && !canApproveQuotes ? (
                  <p className="text-xs text-muted-foreground" data-wp-quote-approve-denied>
                    Approval requires the Event Sales (or admin) quote approval permission.
                  </p>
                ) : null}

                {!deliveryPolicy?.canApprove ? (
                  <p className="text-xs text-muted-foreground">
                    Internal approval is not available for this draft yet.
                  </p>
                ) : null}
              </section>

              {deliveryPolicy?.canPreview && payload ? (
                <details
                  className="rounded-md border border-dashed border-border px-3 py-3"
                  data-wp-customer-quote-preview
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    Customer quote preview
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Staff-only preview. Internal warnings and pricing-source metadata are hidden from
                    customers.
                  </p>
                  <p className="mt-3 text-lg font-semibold">
                    {money(draft.estimatedTotalCents ?? 0, draft.currency)}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {lineItems.map((item, index) => (
                      <li
                        key={`${item.slug}-${index}-preview`}
                        className="flex justify-between gap-3"
                      >
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
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No staff quote draft yet. Create one from the private calculation when you are ready to
          edit pricing.
        </p>
      )}
    </div>
  );
}
