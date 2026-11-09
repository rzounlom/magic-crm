"use client";

import { useMemo, useState } from "react";

import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
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
import { submitPublicWpEventInquiryAction } from "@/server/actions/public-inquiry";
import type { SecurityActionResult } from "@/types/security-action";

const FIELD =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
const LEGEND = "text-sm font-medium text-foreground";
const ERROR = "mt-1 text-xs text-destructive";
const SECTION = "space-y-4 border-t border-border/70 pt-8 first:border-t-0 first:pt-0";

type AttractionState = Record<WpAttractionKey, WpAttractionAnswer | "">;

const emptyAttractions = (): AttractionState => ({
  bowling: "",
  axe: "",
  laser: "",
  golf: "",
  climbing: "",
  arcade: "",
});

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
      className="space-y-8"
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

      <section className={SECTION}>
        <div className="flex items-start gap-3">
          <span className="page-eyebrow shrink-0">01</span>
          <div>
            <h2 className="text-base font-semibold text-foreground sm:text-lg">First, a little about you</h2>
            <p className="mt-1 text-sm text-muted-foreground">Who should we connect with about your event?</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" name="firstName" required error={fieldErrors.firstName} autoComplete="given-name" />
          <Field label="Last name" name="lastName" required error={fieldErrors.lastName} autoComplete="family-name" />
          <Field
            label="Business / organization"
            name="company"
            required
            error={fieldErrors.company}
            autoComplete="organization"
            className="sm:col-span-2"
          />
          <label className="block text-sm">
            <span className={LEGEND}>
              Phone <span aria-hidden="true">*</span>
            </span>
            <input
              className={FIELD}
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(formatUsPhoneInput(event.target.value))}
              maxLength={WP_INTAKE_LIMITS.phone}
            />
            {fieldErrors.phone ? <p className={ERROR}>{fieldErrors.phone}</p> : null}
          </label>
          <Field label="Email" name="email" type="email" required error={fieldErrors.email} autoComplete="email" />
        </div>
      </section>

      <section className={SECTION}>
        <div className="flex items-start gap-3">
          <span className="page-eyebrow shrink-0">02</span>
          <div>
            <h2 className="text-base font-semibold text-foreground sm:text-lg">Tell us about your group</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose your preferred date, start time, and guest count.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className={LEGEND}>
              What type of event are you planning? <span aria-hidden="true">*</span>
            </span>
            <select className={FIELD} name="eventType" required defaultValue="">
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
            <p className={LEGEND}>
              Preferred date <span aria-hidden="true">*</span>
            </p>
            <div className="mt-1 space-y-2">
              {dates.map((value, index) => (
                <input
                  key={`date-${index}`}
                  className={FIELD}
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
                className="mt-2 text-sm font-medium text-foreground underline underline-offset-4"
                onClick={() => setDates((current) => [...current, ""])}
              >
                Add another possible date
              </button>
            ) : null}
            {fieldErrors.dates ? <p className={ERROR}>{fieldErrors.dates}</p> : null}
          </div>

          <Field label="Preferred start time" name="time" type="time" required error={fieldErrors.time} />
          <Field label="Adults" name="adults" type="number" required min={0} max={999} error={fieldErrors.adults} />
          <Field
            label="Children"
            name="children"
            type="number"
            required
            min={0}
            max={999}
            error={fieldErrors.children}
          />

          <label className="block text-sm">
            <span className={LEGEND}>
              How long would you like your event to be? <span aria-hidden="true">*</span>
            </span>
            <select
              className={FIELD}
              name="duration"
              required
              value={duration}
              onChange={(event) => setDuration(event.target.value as WpDurationOption | "")}
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
            <Field
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

      <section className={SECTION}>
        <div className="flex items-start gap-3">
          <span className="page-eyebrow shrink-0">03</span>
          <div>
            <h2 className="text-base font-semibold text-foreground sm:text-lg">Make room for fun</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose one answer for each attraction. Not sure? Choose “Open to recommendations.”
            </p>
          </div>
        </div>
        <div className="space-y-5">
          {WP_ATTRACTION_KEYS.map((key) => (
            <fieldset key={key} className="space-y-2">
              <legend className={LEGEND}>
                {WP_ATTRACTION_LABELS[key]} <span aria-hidden="true">*</span>
              </legend>
              {key === "axe" ? (
                <p className="text-xs text-muted-foreground">
                  Age requirements: Weekdays ages 10+; Weekends ages 16+.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-4">
                {(Object.keys(WP_ATTRACTION_ANSWER_LABELS) as WpAttractionAnswer[]).map((answer) => (
                  <label key={answer} className="inline-flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="radio"
                      name={`attractions[${key}]`}
                      value={answer}
                      required
                      checked={attractions[key] === answer}
                      onChange={() => setAttractions((current) => ({ ...current, [key]: answer }))}
                    />
                    <span>{WP_ATTRACTION_ANSWER_LABELS[answer]}</span>
                  </label>
                ))}
              </div>
              {fieldErrors[`attractions.${key}`] ? (
                <p className={ERROR}>{fieldErrors[`attractions.${key}`]}</p>
              ) : null}
            </fieldset>
          ))}
          {attractionErrorKeys.length === 0 && fieldErrors.attractions ? (
            <p className={ERROR}>{fieldErrors.attractions}</p>
          ) : null}
        </div>
      </section>

      <section className={SECTION}>
        <div className="flex items-start gap-3">
          <span className="page-eyebrow shrink-0">04</span>
          <div>
            <h2 className="text-base font-semibold text-foreground sm:text-lg">Add the finishing touches</h2>
          </div>
        </div>
        <YesNoField
          name="food"
          legend="Would you like food and beverages provided?"
          error={fieldErrors.food}
        />
        <YesNoField
          name="privateRoom"
          legend="Would you like a private event room?"
          error={fieldErrors.privateRoom}
        />
        <YesNoField name="craft" legend="Are you interested in craft beverages?" error={fieldErrors.craft} />
        <YesNoField
          name="hasBudget"
          legend="Do you have a total event budget in mind?"
          error={fieldErrors.hasBudget}
          value={hasBudget}
          onChange={setHasBudget}
        />
        {hasBudget === "yes" ? (
          <Field
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
      </section>

      <section className={SECTION}>
        <div className="flex items-start gap-3">
          <span className="page-eyebrow shrink-0">05</span>
          <div>
            <h2 className="text-base font-semibold text-foreground sm:text-lg">What’s the occasion?</h2>
          </div>
        </div>
        <label className="block text-sm">
          <span className={LEGEND}>
            Describe your event <span aria-hidden="true">*</span>
          </span>
          <textarea
            className={FIELD}
            name="description"
            required
            rows={3}
            maxLength={WP_INTAKE_LIMITS.description}
            placeholder="Tell us the occasion."
          />
          {fieldErrors.description ? <p className={ERROR}>{fieldErrors.description}</p> : null}
        </label>
        <label className="block text-sm">
          <span className={LEGEND}>Special requests</span>
          <textarea
            className={FIELD}
            name="comments"
            rows={3}
            maxLength={WP_INTAKE_LIMITS.comments}
            placeholder="Anything else you would like us to know?"
          />
          {fieldErrors.comments ? <p className={ERROR}>{fieldErrors.comments}</p> : null}
        </label>
        <Field
          label="How did you hear about us?"
          name="referral"
          required
          error={fieldErrors.referral}
          maxLength={WP_INTAKE_LIMITS.referral}
        />
      </section>

      <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Leave this blank
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <footer className="flex flex-col gap-4 border-t border-border/70 pt-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-foreground">Let’s get your group together.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Send your request and our events team will follow up with a recommendation.
            <br />
            This inquiry does not reserve a date or confirm pricing.
          </p>
        </div>
        <PendingSubmitButton
          pendingLabel="Submitting…"
          className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Submit Event Request →
        </PendingSubmitButton>
      </footer>
    </SecurityActionForm>
  );
}

function Field({
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
    <label className={`block text-sm ${className ?? ""}`}>
      <span className={LEGEND}>
        {label} {props.required ? <span aria-hidden="true">*</span> : null}
      </span>
      <input className={FIELD} name={name} {...props} />
      {error ? <p className={ERROR}>{error}</p> : null}
    </label>
  );
}

function YesNoField({
  name,
  legend,
  error,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  error?: string;
  value?: WpYesNo | "";
  onChange?: (value: WpYesNo) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className={LEGEND}>
        {legend} <span aria-hidden="true">*</span>
      </legend>
      <div className="flex flex-wrap gap-4">
        {(["yes", "no"] as const).map((answer) => (
          <label key={answer} className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={name}
              value={answer}
              required
              {...(onChange
                ? {
                    checked: value === answer,
                    onChange: () => onChange(answer),
                  }
                : {})}
            />
            <span>{answer === "yes" ? "Yes" : "No"}</span>
          </label>
        ))}
      </div>
      {error ? <p className={ERROR}>{error}</p> : null}
    </fieldset>
  );
}
