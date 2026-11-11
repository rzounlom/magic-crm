import {
  WP_APPROVED_PLUGIN_BASELINE_LABEL,
  WP_APPROVED_PLUGIN_BASELINE_STATUS,
  WP_ATTRACTION_ANSWER_LABELS,
  WP_ATTRACTION_KEYS,
  WP_ATTRACTION_LABELS,
  WP_PLUGIN_DEFAULT_ESTIMATE_LABEL,
  parseWpIntakeMessageMetadata,
  type WpIntakeMessageMetadata,
} from "@/lib/event-planner/wp-intake-contract";

type MessageLike = {
  metadata?: unknown;
};

/** Mirrors `WP_PARITY_SNAPSHOT_VERSION` without importing server/crypto into the UI tree. */
const WP_PARITY_SNAPSHOT_VERSION = 1;

type WpParityPlanSnapshot = {
  name: string;
  total_cents: number;
  subtotal_cents: number;
  tax_cents: number;
  per_guest_cents: number;
  dining_minutes: number;
  required_minutes: number;
  fits_duration: boolean;
  hard_review: boolean;
  selected_attractions: string[];
  review: string[];
  why: string | null;
  items: Array<{
    label: string;
    quantity: number;
    subtotal_cents: number;
    tax_cents: number;
  }>;
  itinerary: Array<{
    start_minute: number;
    end_minute: number;
    label: string;
    group: string;
    start?: string;
    end?: string;
  }>;
};

type WpParitySnapshot =
  | {
      snapshot_version: number;
      valid: true;
      pricing_source?: string;
      pricing_revision?: string;
      calculated_at?: string;
      dates: Array<{
        date: string;
        recommendation: WpParityPlanSnapshot;
        alternatives: WpParityPlanSnapshot[];
      }>;
    }
  | {
      snapshot_version: number;
      valid: false;
      pricing_source?: string;
      pricing_revision?: string | null;
      calculated_at?: string;
      errors: Record<string, string>;
      missing_keys?: string[];
    };

export function findWpIntakeMetadata(
  messages: MessageLike[] | null | undefined,
): WpIntakeMessageMetadata | null {
  if (!messages?.length) {
    return null;
  }
  for (const message of messages) {
    const parsed = parseWpIntakeMessageMetadata(message.metadata);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function parseSnapshot(value: unknown): WpParitySnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { snapshot_version?: unknown; valid?: unknown };
  if (record.snapshot_version !== WP_PARITY_SNAPSHOT_VERSION) {
    return null;
  }
  if (record.valid !== true && record.valid !== false) {
    return null;
  }
  return value as WpParitySnapshot;
}

type PricingBanner = {
  tone: "warning" | "success" | "danger";
  title: string;
  detail: string;
};

function pricingBanner(
  meta: WpIntakeMessageMetadata["privateCalculation"],
  missingKeys: string[],
): PricingBanner | null {
  if (meta.status === "incomplete" || meta.pricingSource === "incomplete") {
    return {
      tone: "danger",
      title: "Incomplete — needs staff review",
      detail:
        missingKeys.length > 0
          ? `No price was calculated. Missing pricing configuration: ${missingKeys.join(", ")}.`
          : "No price was calculated because pricing configuration is incomplete.",
    };
  }
  if (meta.pricingSource === "plugin_defaults") {
    return {
      tone: "warning",
      title: WP_PLUGIN_DEFAULT_ESTIMATE_LABEL,
      detail:
        "Private staff estimate only. Do not send these totals to the customer until live venue pricing is verified. No booking, hold, or public proposal is created from this calculation.",
    };
  }
  if (meta.pricingSource === "approved_plugin_baseline") {
    return {
      tone: "warning",
      title: WP_APPROVED_PLUGIN_BASELINE_LABEL,
      detail: WP_APPROVED_PLUGIN_BASELINE_STATUS,
    };
  }
  if (meta.pricingSource === "tenant_live") {
    return {
      tone: "success",
      title: "Calculated with tenant_live verified pricing",
      detail: meta.pricingRevision
        ? `Prices come from this organization’s verified WordPress pricing pack (revision ${meta.pricingRevision}). Staff must still confirm availability and customer-specific requirements before quoting.`
        : "Prices come from this organization’s verified WordPress pricing pack. Staff must still confirm availability and customer-specific requirements before quoting.",
    };
  }
  return null;
}

const BANNER_TONE_CLASS: Record<PricingBanner["tone"], string> = {
  warning: "border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  success: "border-emerald-500/50 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
  danger: "border-destructive/50 bg-destructive/10 text-destructive",
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function WpIntakeAnswersPanel({ metadata }: { metadata: WpIntakeMessageMetadata }) {
  const { answers, privateCalculation } = metadata;
  const snapshot = parseSnapshot(privateCalculation.snapshot);
  const missingKeys =
    privateCalculation.missingKeys && privateCalculation.missingKeys.length > 0
      ? privateCalculation.missingKeys
      : snapshot?.valid === false
        ? (snapshot.missing_keys ?? [])
        : [];
  const banner = pricingBanner(privateCalculation, missingKeys);

  const nextSteps =
    privateCalculation.pricingSource === "plugin_defaults"
      ? [
          "Review the customer answers and private recommendation below.",
          "Verify pricing against live venue rates before quoting the customer.",
          "Confirm inventory/availability for the preferred date and attractions.",
          "Follow up by email or note — do not publish plugin-default totals as a quote.",
        ]
      : privateCalculation.pricingSource === "approved_plugin_baseline"
        ? [
            "Review the customer answers and private recommendation below.",
            "Create a staff quote draft from the private calculation (editable MagiCRM working draft).",
            "Confirm inventory/availability before any hold or booking.",
            "Do not send a customer quote, create holds, or request payment until explicitly approved.",
          ]
        : privateCalculation.pricingSource === "incomplete" || privateCalculation.status === "incomplete"
          ? [
              "Pricing configuration is incomplete — calculate or price manually.",
              "Review customer answers, then follow up with verified options.",
            ]
          : [
              "Review the customer answers and private recommendation below.",
              "Confirm inventory/availability, then follow up with the customer.",
            ];

  return (
    <div className="space-y-4" data-wp-intake-answers>
      <div
        className="rounded-[var(--radius-control)] border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
        data-wp-next-steps
      >
        <p className="font-semibold text-foreground">Suggested next steps</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-foreground/80">
          {nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <details className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Structured customer answers
          <span className="ml-2 font-normal text-muted-foreground">({metadata.intakeVersion})</span>
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">
          Original public intake answers for staff review. Not published as customer packages.
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Company" value={answers.company} />
          <Item label="Referral" value={answers.referral} />
          <Item label="Preferred dates" value={answers.dates.join(", ")} />
          <Item label="Start time" value={answers.time} />
          <Item label="Adults" value={String(answers.adults)} />
          <Item label="Children" value={String(answers.children)} />
          <Item
            label="Duration"
            value={`${answers.duration}${answers.otherHours != null ? ` (${answers.otherHours}h)` : ""} · ${answers.minutes} min`}
          />
          <Item label="Food" value={answers.food} />
          <Item label="Private room" value={answers.privateRoom} />
          <Item label="Craft beverages" value={answers.craft} />
          <Item
            label="Budget"
            value={
              answers.hasBudget === "yes" && answers.budgetCents != null
                ? money(answers.budgetCents)
                : "Flexible"
            }
          />
        </dl>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Attraction preferences
          </p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2" data-wp-attraction-answers>
            {WP_ATTRACTION_KEYS.map((key) => (
              <li key={key}>
                {WP_ATTRACTION_LABELS[key]}: {WP_ATTRACTION_ANSWER_LABELS[answers.attractions[key]]}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Occasion</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{answers.description}</p>
        </div>
        {answers.comments ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Special requests
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{answers.comments}</p>
          </div>
        ) : null}
      </details>

      <div
        className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4 text-sm"
        data-wp-private-calc
      >
        <p className="font-medium text-foreground">Private recommendation (staff only)</p>
        {banner ? (
          <div
            className={`mt-2 rounded-md border px-3 py-2 ${BANNER_TONE_CLASS[banner.tone]}`}
            data-wp-pricing-source={privateCalculation.pricingSource ?? "unknown"}
          >
            <p className="font-medium">{banner.title}</p>
            <p className="mt-0.5 text-xs">{banner.detail}</p>
            {missingKeys.length > 0 ? (
              <ul className="mt-1 list-disc pl-4 text-xs" data-wp-missing-keys>
                {missingKeys.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <p className="mt-1 text-muted-foreground" data-wp-pricing-meta>
          Status: {privateCalculation.status}
          {privateCalculation.pricingSource
            ? ` · pricing source ${privateCalculation.pricingSource}`
            : ""}
          {privateCalculation.rulesVersion
            ? ` · catalog version ${privateCalculation.rulesVersion}`
            : ""}
          {privateCalculation.pricingRevision
            ? ` · configuration revision ${privateCalculation.pricingRevision}`
            : ""}
          {snapshot?.calculated_at ? ` · calculated ${snapshot.calculated_at}` : ""}
        </p>
        {privateCalculation.summary ? (
          <p className="mt-1 text-muted-foreground">{privateCalculation.summary}</p>
        ) : null}
        {privateCalculation.errorMessage ? (
          <p className="mt-2 text-destructive">{privateCalculation.errorMessage}</p>
        ) : null}
        {snapshot?.valid === false && Object.keys(snapshot.errors).length > 0 ? (
          <p className="mt-2 text-destructive">
            Calculator validation errors: {Object.values(snapshot.errors).join(" ")}
          </p>
        ) : null}
        {snapshot?.valid === true
          ? snapshot.dates.map((day) => (
              <div key={day.date} className="mt-4 space-y-3 border-t border-border/70 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
                  {day.date}
                </p>
                <PlanCard title="Main recommendation" plan={day.recommendation} />
                {day.alternatives.map((plan, index) => (
                  <PlanCard key={`${day.date}-alt-${index}`} title={`Alternative ${index + 1}`} plan={plan} />
                ))}
              </div>
            ))
          : null}
        <p className="mt-3 text-xs text-muted-foreground">
          These totals are private staff estimates. They do not reserve inventory, create bookings, or
          publish a customer quote. Availability and eligibility still require confirmation.
        </p>
      </div>
    </div>
  );
}

function formatClock(row: WpParityPlanSnapshot["itinerary"][number]): string {
  if (row.start && row.end) {
    return `${row.start} – ${row.end}`;
  }
  const fmt = (minute: number) => {
    const normalized = ((minute % (24 * 60)) + 24 * 60) % (24 * 60);
    const hours = Math.floor(normalized / 60);
    const mins = normalized % 60;
    const suffix = hours >= 12 ? "PM" : "AM";
    const display = hours % 12 === 0 ? 12 : hours % 12;
    return `${display}:${mins.toString().padStart(2, "0")} ${suffix}`;
  };
  return `${fmt(row.start_minute)} – ${fmt(row.end_minute)}`;
}

function PlanCard({ title, plan }: { title: string; plan: WpParityPlanSnapshot }) {
  const itinerary = Array.isArray(plan.itinerary) ? plan.itinerary : [];
  return (
    <div
      className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-3 shadow-sm"
      data-wp-plan-card
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-foreground">
          {title}: {plan.name}
        </p>
        <p className="text-sm font-semibold tabular-nums text-foreground">{money(plan.total_cents)}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Subtotal {money(plan.subtotal_cents)} · tax {money(plan.tax_cents)} · per guest{" "}
        {money(plan.per_guest_cents)}
        {plan.dining_minutes ? ` · dining ${plan.dining_minutes}m` : " · no separate dining block"}
        {` · required ${plan.required_minutes}m`}
        {!plan.fits_duration ? " · does not fit requested duration" : ""}
        {plan.hard_review ? " · hard review" : ""}
      </p>
      {plan.selected_attractions.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Attractions: {plan.selected_attractions.join(", ")}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No attractions selected in this configuration.</p>
      )}
      {plan.review.length > 0 ? (
        <div
          className="mt-3 rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 px-3 py-2"
          data-wp-plan-warnings
        >
          <p className="text-xs font-semibold text-warning">Scheduling / capacity warnings</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-foreground">
            {plan.review.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <details className="mt-3">
        <summary className="cursor-pointer text-[length:var(--text-caption)] font-semibold text-primary">
          View itinerary and itemized estimate
        </summary>
        {plan.why ? <p className="mt-2 text-xs text-muted-foreground">{plan.why}</p> : null}
        {itinerary.length > 0 ? (
          <div className="mt-3" data-wp-plan-itinerary>
            <p className="text-xs font-semibold text-foreground/80">Suggested itinerary</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {itinerary.map((row, index) => (
                <li key={`${row.label}-${row.start_minute}-${index}`}>
                  <span className="tabular-nums text-foreground/80">{formatClock(row)}</span>
                  {" · "}
                  {row.label}
                  {row.group && row.group !== "All guests" ? ` (${row.group})` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {plan.items.length > 0 ? (
          <div className="mt-3" data-wp-plan-items>
            <p className="text-xs font-semibold text-foreground/80">Itemized estimate</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {plan.items.map((item, index) => (
                <li key={`${item.label}-${index}`}>
                  {item.label} × {item.quantity} — {money(item.subtotal_cents)}
                  {item.tax_cents ? ` (+${money(item.tax_cents)} tax)` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-foreground/60">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}
