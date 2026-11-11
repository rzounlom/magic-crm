"use client";

import { useMemo, useState } from "react";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { ChoiceSegment } from "@/components/ui/choice-segment";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { controlClassName } from "@/components/ui/field";
import {
  WP_ATTRACTION_ANSWER_LABELS,
  WP_ATTRACTION_KEYS,
  WP_ATTRACTION_LABELS,
  WP_DURATION_OPTIONS,
  WP_EVENT_TYPES,
  WP_INTAKE_LIMITS,
  type WpAttractionAnswer,
  type WpAttractionKey,
  type WpDurationOption,
  type WpYesNo,
} from "@/lib/event-planner/wp-intake-contract";
import { formatUsPhoneInput } from "@/lib/inquiries/public-phone";
import { cn } from "@/lib/ui/cn";
import { submitPublicWpEventInquiryAction } from "@/server/actions/public-inquiry";
import type { SecurityActionResult } from "@/types/security-action";

const LABEL = "text-[length:var(--text-label)] font-semibold text-foreground";
const ERROR = "mt-1.5 text-[length:var(--text-caption)] text-destructive";
const SECTION =
  "rounded-[var(--radius-card)] border border-border/80 bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6";

type AttractionState = Record<WpAttractionKey, WpAttractionAnswer | "">;

const emptyAttractions = (): AttractionState => ({
  bowling: "",
  axe: "",
  laser: "",
  golf: "",
  climbing: "",
  arcade: "",
});

const ATTRACTION_OPTIONS = (
  Object.keys(WP_ATTRACTION_ANSWER_LABELS) as WpAttractionAnswer[]
).map((value) => ({
  value,
  label: WP_ATTRACTION_ANSWER_LABELS[value],
}));

const YES_NO_OPTIONS = [
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
];

type PublicEventInquiryFormProps = {
  organizationSlug: string;
};

export function PublicEventInquiryForm({ organizationSlug }: PublicEventInquiryFormProps) {
  const [submissionId] = useState(() => crypto.randomUUID());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<string[]>([""]);
  const [duration, setDuration] = useState<WpDurationOption | "">("");
  const [hasBudget, setHasBudget] = useState<WpYesNo | "">("");
  const [attractions, setAttractions] = useState<AttractionState>(emptyAttractions);
  const [phone, setPhone] = useState("");

  const canAddDate = dates.length < WP_INTAKE_LIMITS.dates;

  const attractionErrorKeys = useMemo(
    () => WP_ATTRACTION_KEYS.filter((key) => fieldErrors[`attractions.${key}`]),
    [fieldErrors],
  );

  function onResult(result: SecurityActionResult) {
    if (!result.ok && result.fieldErrors) {
      setFieldErrors(result.fieldErrors);
      return;
    }
    setFieldErrors({});
  }

  return (
    <SecurityActionForm
      action={submitPublicWpEventInquiryAction}
      className="space-y-5 sm:space-y-6"
      notice={{
        successTitle: "Event request received",
        successDescription: "Our team will follow up with recommendations.",
        errorTitle: "Unable to send request",
      }}
      blocking
      blockingLabel="Submitting your event request…"
      onResult={onResult}
    >
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="submissionId" value={submissionId} />

      <section className={SECTION} aria-labelledby="inquire-section-contact">
        <SectionHeading
          id="inquire-section-contact"
          step="01"
          title="Contact information"
          description="Who should we connect with about your event?"
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            name="firstName"
            required
            error={fieldErrors.firstName}
            autoComplete="given-name"
          />
          <TextField
            label="Last name"
            name="lastName"
            required
            error={fieldErrors.lastName}
            autoComplete="family-name"
          />
          <TextField
            label="Business / organization"
            name="company"
            required
            error={fieldErrors.company}
            autoComplete="organization"
            className="sm:col-span-2"
          />
          <label className="block min-w-0">
            <span className={LABEL}>
              Phone <span className="text-destructive" aria-hidden>*</span>
            </span>
            <input
              className={cn(controlClassName(), "mt-1.5")}
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(formatUsPhoneInput(event.target.value))}
              maxLength={WP_INTAKE_LIMITS.phone}
              aria-invalid={fieldErrors.phone ? true : undefined}
            />
            {fieldErrors.phone ? <p className={ERROR}>{fieldErrors.phone}</p> : null}
          </label>
          <TextField
            label="Email"
            name="email"
            type="email"
            required
            error={fieldErrors.email}
            autoComplete="email"
          />
        </div>
      </section>

      <section className={SECTION} aria-labelledby="inquire-section-event">
        <SectionHeading
          id="inquire-section-event"
          step="02"
          title="Event details"
          description="Preferred date, start time, and guest count."
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block min-w-0 sm:col-span-2">
            <span className={LABEL}>
              What type of event are you planning?{" "}
              <span className="text-destructive" aria-hidden>*</span>
            </span>
            <select
              className={cn(controlClassName(), "mt-1.5")}
              name="eventType"
              required
              defaultValue=""
              aria-invalid={fieldErrors.eventType ? true : undefined}
            >
              <option value="">Choose an event type</option>
              {WP_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {fieldErrors.eventType ? <p className={ERROR}>{fieldErrors.eventType}</p> : null}
          </label>

          <div className="sm:col-span-2">
            <p className={LABEL}>
              Preferred date <span className="text-destructive" aria-hidden>*</span>
            </p>
            <div className="mt-1.5 space-y-2">
              {dates.map((value, index) => (
                <input
                  key={`date-${index}`}
                  className={controlClassName()}
                  name="dates[]"
                  type="date"
                  required={index === 0}
                  value={value}
                  onChange={(event) => {
                    const next = [...dates];
                    next[index] = event.target.value;
                    setDates(next);
                  }}
                />
              ))}
            </div>
            {canAddDate ? (
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                onClick={() => setDates((current) => [...current, ""])}
              >
                Add another possible date
              </button>
            ) : null}
            {fieldErrors.dates ? <p className={ERROR}>{fieldErrors.dates}</p> : null}
          </div>

          <TextField label="Preferred start time" name="time" type="time" required error={fieldErrors.time} />
          <TextField
            label="Adults"
            name="adults"
            type="number"
            required
            min={0}
            max={999}
            error={fieldErrors.adults}
          />
          <TextField
            label="Children"
            name="children"
            type="number"
            required
            min={0}
            max={999}
            error={fieldErrors.children}
          />

          <label className="block min-w-0">
            <span className={LABEL}>
              How long would you like your event to be?{" "}
              <span className="text-destructive" aria-hidden>*</span>
            </span>
            <select
              className={cn(controlClassName(), "mt-1.5")}
              name="duration"
              required
              value={duration}
              onChange={(event) => setDuration(event.target.value as WpDurationOption | "")}
              aria-invalid={fieldErrors.duration ? true : undefined}
            >
              <option value="">Choose a duration</option>
              {WP_DURATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {fieldErrors.duration ? <p className={ERROR}>{fieldErrors.duration}</p> : null}
          </label>

          {duration === "Other" ? (
            <TextField
              label="Desired duration in hours"
              name="otherHours"
              type="number"
              required
              min={0.01}
              max={24}
              step="any"
              error={fieldErrors.otherHours}
            />
          ) : null}
        </div>
      </section>

      <section className={SECTION} aria-labelledby="inquire-section-attractions">
        <SectionHeading
          id="inquire-section-attractions"
          step="03"
          title="Attraction preferences"
          description='Choose one answer for each attraction. Not sure? Choose “Open to recommendations.”'
        />
        <div className="mt-5 space-y-5">
          {WP_ATTRACTION_KEYS.map((key) => (
            <div key={key} className="space-y-2">
              {key === "axe" ? (
                <p className="text-[length:var(--text-caption)] text-muted-foreground">
                  Age requirements: Weekdays ages 10+; Weekends ages 16+.
                </p>
              ) : null}
              <ChoiceSegment
                name={`attractions[${key}]`}
                legend={WP_ATTRACTION_LABELS[key]}
                options={ATTRACTION_OPTIONS}
                required
                columns={3}
                value={attractions[key]}
                onChange={(answer) =>
                  setAttractions((current) => ({ ...current, [key]: answer }))
                }
                error={fieldErrors[`attractions.${key}`]}
              />
            </div>
          ))}
          {attractionErrorKeys.length === 0 && fieldErrors.attractions ? (
            <p className={ERROR}>{fieldErrors.attractions}</p>
          ) : null}
        </div>
      </section>

      <section className={SECTION} aria-labelledby="inquire-section-preferences">
        <SectionHeading
          id="inquire-section-preferences"
          step="04"
          title="Food, room, and budget"
          description="Optional preferences that help us shape the recommendation."
        />
        <div className="mt-5 space-y-5">
          <ChoiceSegment
            name="food"
            legend="Would you like food and beverages provided?"
            options={YES_NO_OPTIONS}
            required
            error={fieldErrors.food}
          />
          <ChoiceSegment
            name="privateRoom"
            legend="Would you like a private event room?"
            options={YES_NO_OPTIONS}
            required
            error={fieldErrors.privateRoom}
          />
          <ChoiceSegment
            name="craft"
            legend="Are you interested in craft beverages?"
            options={YES_NO_OPTIONS}
            required
            error={fieldErrors.craft}
          />
          <ChoiceSegment
            name="hasBudget"
            legend="Do you have a total event budget in mind?"
            options={YES_NO_OPTIONS}
            required
            value={hasBudget}
            onChange={setHasBudget}
            error={fieldErrors.hasBudget}
          />
          {hasBudget === "yes" ? (
            <TextField
              label="Total event budget, including tax ($)"
              name="budget"
              type="number"
              required
              min={0.01}
              max={WP_INTAKE_LIMITS.budgetMaxDollars}
              step="0.01"
              error={fieldErrors.budget}
            />
          ) : null}
        </div>
      </section>

      <section className={SECTION} aria-labelledby="inquire-section-occasion">
        <SectionHeading
          id="inquire-section-occasion"
          step="05"
          title="Occasion and special requests"
          description="Share the story behind the event so our team can personalize options."
        />
        <div className="mt-5 space-y-4">
          <label className="block min-w-0">
            <span className={LABEL}>
              Describe your event <span className="text-destructive" aria-hidden>*</span>
            </span>
            <textarea
              className={cn(controlClassName(), "mt-1.5 min-h-24")}
              name="description"
              required
              rows={3}
              maxLength={WP_INTAKE_LIMITS.description}
              placeholder="Tell us the occasion."
              aria-invalid={fieldErrors.description ? true : undefined}
            />
            {fieldErrors.description ? <p className={ERROR}>{fieldErrors.description}</p> : null}
          </label>
          <label className="block min-w-0">
            <span className={LABEL}>Special requests</span>
            <textarea
              className={cn(controlClassName(), "mt-1.5 min-h-24")}
              name="comments"
              rows={3}
              maxLength={WP_INTAKE_LIMITS.comments}
              placeholder="Anything else you would like us to know?"
              aria-invalid={fieldErrors.comments ? true : undefined}
            />
            {fieldErrors.comments ? <p className={ERROR}>{fieldErrors.comments}</p> : null}
          </label>
          <TextField
            label="How did you hear about us?"
            name="referral"
            required
            error={fieldErrors.referral}
            maxLength={WP_INTAKE_LIMITS.referral}
          />
        </div>
      </section>

      <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Leave this blank
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <footer className="rounded-[var(--radius-card)] border border-border/80 bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="text-base font-semibold text-foreground">Ready to send your request?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Our events team will follow up with a recommendation. Submitting an inquiry does not
              reserve a date or confirm pricing.
            </p>
          </div>
          <PendingSubmitButton
            pendingLabel="Submitting…"
            className="inline-flex min-h-[var(--control-height)] items-center justify-center rounded-[var(--radius-control)] bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Submit event request
          </PendingSubmitButton>
        </div>
      </footer>
    </SecurityActionForm>
  );
}

function SectionHeading({
  id,
  step,
  title,
  description,
}: {
  id: string;
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/70 pb-4">
      <span className="mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/10 px-2 text-[length:var(--text-caption)] font-semibold tracking-wide text-primary">
        {step}
      </span>
      <div className="min-w-0">
        <h2 id={id} className="text-[length:var(--text-title-sm)] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function TextField({
  label,
  name,
  error,
  className,
  ...props
}: {
  label: string;
  name: string;
  error?: string;
  className?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  min?: number;
  max?: number;
  step?: string | number;
  maxLength?: number;
  defaultValue?: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className={LABEL}>
        {label}{" "}
        {props.required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </span>
      <input
        className={cn(controlClassName(), "mt-1.5")}
        name={name}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error ? <p className={ERROR}>{error}</p> : null}
    </label>
  );
}
