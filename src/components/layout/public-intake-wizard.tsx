"use client";

import { useRouter } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useId, useMemo, useReducer, useRef, useState, type FormEvent, type ReactNode } from "react";

import { PUBLIC_INQUIRY_PENDING_COPY } from "@/components/layout/public-inquiry-pending";
import { BlockingMutation } from "@/components/ui/blocking-mutation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PendingActionProvider, PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  BUDGET_PREFERENCE_LABELS,
  FOOD_PREFERENCE_LABELS,
  FOOD_PREFERENCE_VALUES,
  INTAKE_GUEST_MIX_LABELS,
  INTAKE_GUEST_MIX_VALUES,
  PLANNER_STEPS,
  PLANNER_STEP_TITLES,
  PRIVATE_SPACE_PREFERENCE_LABELS,
  PRIVATE_SPACE_PREFERENCE_VALUES,
  formatPreferredDateTime,
  intakeBudgetLabel,
  initialPlannerState,
  plannerAnswersToIntakeRecord,
  plannerStepError,
  publicEventTypeOptions,
  reducePlanner,
  to24HourTime,
  type PlannerAnswers,
  type PlannerStep,
} from "@/lib/event-planner/intake-contract";
import { formatCustomerDurationText } from "@/lib/event-planner/labels";
import { formatUsPhoneInput } from "@/lib/inquiries/public-phone";
import { onSafeSubmitAttempt } from "@/lib/ui/confirm-gate";
import { notify } from "@/lib/ui/notify";
import { yieldToPaint } from "@/lib/ui/yield-to-paint";
import { submitPublicInquiryAction } from "@/server/actions/public-inquiry";
import { readPublicIntakeFields } from "@/server/inquiries/intake-validation";
import { BUDGET_BAND_LABELS, BUDGET_BAND_VALUES } from "@/types/event-planner";
import type { SecurityActionResult } from "@/types/security-action";

export type PublicPlannerAttraction = { id: string; name: string; description?: string | null };

const CARD_CLASS =
  "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const INPUT_CLASS =
  "mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed";
const BACK_CLASS =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-2 text-base font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed";

function selectedCardClass(selected: boolean) {
  return selected
    ? `${CARD_CLASS} border-primary bg-primary/10 ring-2 ring-primary`
    : `${CARD_CLASS} border-border bg-background hover:border-primary/40`;
}

export function PublicIntakeWizard({
  organizationSlug,
  attractions = [],
  action = submitPublicInquiryAction,
}: {
  organizationSlug: string;
  attractions?: PublicPlannerAttraction[];
  action?: (formData: FormData) => Promise<SecurityActionResult>;
}) {
  const router = useRouter();
  const honeypotId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef<PlannerStep>("event");
  const pendingRef = useRef(false);
  const [state, dispatch] = useReducer(reducePlanner, undefined, initialPlannerState);
  const [showError, setShowError] = useState(false);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const [pending, setPending] = useState(false);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const attractionNames = useMemo(
    () => new Map(attractions.map((item) => [item.id, item.name])),
    [attractions],
  );

  useEffect(() => {
    if (previousStep.current === state.step) {
      return;
    }
    previousStep.current = state.step;
    setShowError(false);
    headingRef.current?.focus();
  }, [state.step]);

  const stepError = showError ? plannerStepError(state.step, state.answers) : null;
  const stepIndex = PLANNER_STEPS.indexOf(state.step);
  const startTime = to24HourTime(state.answers.startHour, state.answers.startMinute, state.answers.startPeriod) ?? "";

  function edit(patch: Partial<PlannerAnswers>) {
    setShowError(false);
    dispatch({ type: "edit", patch });
  }

  function onContinue() {
    if (plannerStepError(state.step, state.answers)) {
      setShowError(true);
      return;
    }
    dispatch({ type: "next" });
  }

  function confirmReset() {
    dispatch({ type: "startOver" });
    setSubmissionId(crypto.randomUUID());
    setContactErrors({});
    setShowError(false);
    setConfirmStartOver(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onSafeSubmitAttempt(pendingRef.current) === "block") {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const clientCheck = readPublicIntakeFields({
      ...plannerAnswersToIntakeRecord(
        {
          ...state.answers,
          firstName: String(formData.get("firstName") ?? ""),
          lastName: String(formData.get("lastName") ?? ""),
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          customerGroupName: String(formData.get("customerGroupName") ?? ""),
          notes: String(formData.get("notes") ?? ""),
        },
        submissionId,
      ),
      companyWebsite: String(formData.get("companyWebsite") ?? ""),
    });
    if (!clientCheck.success) {
      setContactErrors(clientCheck.fieldErrors);
      setShowError(true);
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setContactErrors({});
    await yieldToPaint();

    let keepPending = false;
    try {
      const result = await action(formData);
      if (!result.ok) {
        setContactErrors(result.fieldErrors ?? {});
        notify.error({
          title: result.title ?? "Unable to send inquiry",
          description: result.message,
        });
        return;
      }
      if (result.redirectTo) {
        keepPending = true;
        router.push(result.redirectTo);
        return;
      }
    } catch (error) {
      unstable_rethrow(error);
      notify.error({
        title: "Unable to send inquiry",
        description: "Something went wrong. Try again.",
      });
    } finally {
      if (!keepPending) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  const scrollBody =
    state.step === "review" ? (
      <form id="planner-review" aria-busy={pending} onSubmit={onSubmit}>
          <input type="hidden" name="organizationSlug" value={organizationSlug} />
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="eventType" value={state.answers.eventType} />
          <input type="hidden" name="preferredDate" value={state.answers.eventDate} />
          <input type="hidden" name="startTime" value={startTime} />
          <input type="hidden" name="guestCount" value={state.answers.guestCount} />
          <input type="hidden" name="guestMix" value={state.answers.guestMix} />
          <input type="hidden" name="foodPreference" value={state.answers.foodPreference} />
          <input type="hidden" name="privateSpacePreference" value={state.answers.privateSpacePreference} />
          <input type="hidden" name="budgetBand" value={state.answers.budgetBand} />
          <input
            type="hidden"
            name="budgetPreference"
            value={state.answers.budgetPreference === "FLEXIBLE" ? "FLEXIBLE" : ""}
          />
          {state.answers.attractionInterestIds.map((id) => (
            <input key={id} type="hidden" name="attractionInterestIds" value={id} />
          ))}
          <div className="hidden" aria-hidden="true">
            <label htmlFor={honeypotId}>Company website</label>
            <input id={honeypotId} name="companyWebsite" tabIndex={-1} autoComplete="off" />
          </div>

          <ReviewList
            answers={state.answers}
            attractionNames={attractionNames}
            onEdit={(step) => dispatch({ type: "go", step })}
          />
          <p className="mt-4 text-sm text-foreground/70">
            Building these options does not book your event or hold a time.
          </p>

          <div className="mt-8 grid gap-4 pb-2">
            <ContactField
              label="First name"
              name="firstName"
              value={state.answers.firstName}
              autoComplete="given-name"
              disabled={pending}
              error={contactErrors.firstName}
              onChange={(value) => edit({ firstName: value })}
            />
            <ContactField
              label="Last name"
              name="lastName"
              value={state.answers.lastName}
              autoComplete="family-name"
              disabled={pending}
              error={contactErrors.lastName}
              onChange={(value) => edit({ lastName: value })}
            />
            <ContactField
              label="Email"
              name="email"
              type="email"
              value={state.answers.email}
              autoComplete="email"
              disabled={pending}
              error={contactErrors.email}
              onChange={(value) => edit({ email: value })}
            />
            <ContactField
              label="Phone (optional)"
              name="phone"
              type="tel"
              value={state.answers.phone}
              autoComplete="tel"
              disabled={pending}
              error={contactErrors.phone}
              onChange={(value) => edit({ phone: formatUsPhoneInput(value) })}
            />
            <ContactField
              label="Group or company name (optional)"
              name="customerGroupName"
              value={state.answers.customerGroupName}
              disabled={pending}
              error={contactErrors.customerGroupName}
              onChange={(value) => edit({ customerGroupName: value })}
            />
            <label className="block text-sm font-medium text-foreground">
              Notes (optional)
              <textarea
                name="notes"
                value={state.answers.notes}
                disabled={pending}
                rows={3}
                className={INPUT_CLASS}
                onChange={(event) => edit({ notes: event.target.value })}
              />
            </label>
          </div>
      </form>
    ) : (
      <StepBody
        step={state.step}
        answers={state.answers}
        attractions={attractions}
        errorId={stepError ? `${state.step}-error` : undefined}
        onEdit={edit}
        onToggleAttraction={(id) => dispatch({ type: "toggleAttraction", id })}
      />
    );

  return (
    <>
      <PendingActionProvider pending={pending}>
      <div
        data-planner-shell
        aria-busy={pending}
        inert={pending ? true : undefined}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center justify-between gap-4">
          <p className="text-sm font-medium text-foreground/70">
            Step {stepIndex + 1} of {PLANNER_STEPS.length}
          </p>
          <button
            type="button"
            className="cursor-pointer rounded-md border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
            onClick={() => setConfirmStartOver(true)}
            disabled={pending}
          >
            Start over
          </button>
        </div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 shrink-0 text-2xl font-semibold tracking-tight text-foreground outline-none"
        >
          {PLANNER_STEP_TITLES[state.step]}
        </h2>
        <div className="shrink-0">
          <StepIntro step={state.step} />
        </div>
        {stepError ? (
          <p id={`${state.step}-error`} role="alert" className="mt-4 shrink-0 text-sm text-destructive">
            {stepError}
          </p>
        ) : null}

        <div data-planner-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4">
          {scrollBody}
        </div>

        <div
          data-planner-actions
          className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background pt-3"
        >
          {state.step === "event" ? (
            <span />
          ) : (
            <BackButton disabled={pending} onClick={() => dispatch({ type: "back" })} />
          )}
          {state.step === "review" ? (
            <PendingSubmitButton
              form="planner-review"
              pendingLabel={PUBLIC_INQUIRY_PENDING_COPY}
              className="rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              Build my event options
            </PendingSubmitButton>
          ) : (
            <button
              type="button"
              className="cursor-pointer rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
              onClick={onContinue}
              disabled={pending}
            >
              Continue
            </button>
          )}
        </div>
      </div>
      </PendingActionProvider>

      <BlockingMutation active={pending} label={PUBLIC_INQUIRY_PENDING_COPY} />

      <ConfirmDialog
        open={confirmStartOver}
        title="Start over?"
        description="Your current plan will be discarded and you'll return to the beginning."
        confirmLabel="Start over"
        onCancel={() => setConfirmStartOver(false)}
        onConfirm={confirmReset}
      />
    </>
  );
}

function BackButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={BACK_CLASS} onClick={onClick} disabled={disabled}>
      <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" fill="currentColor">
        <path d="M11.78 4.22a.75.75 0 0 1 0 1.06L8.06 9h7.19a.75.75 0 0 1 0 1.5H8.06l3.72 3.72a.75.75 0 1 1-1.06 1.06l-5-5a.75.75 0 0 1 0-1.06l5-5a.75.75 0 0 1 1.06 0Z" />
      </svg>
      Back
    </button>
  );
}

function StepIntro({ step }: { step: PlannerStep }) {
  if (step === "attractions") {
    return (
      <p className="mt-3 text-sm text-foreground/70">
        Choose anything your group is interested in. We&apos;ll use your preferences, group size, and availability to
        build the best options. You can continue without selecting any.
      </p>
    );
  }
  if (step === "budget") {
    return (
      <p className="mt-3 text-sm text-foreground/70">
        This is a total for the event, and it only guides recommendations. It is not a quote or a maximum price.
      </p>
    );
  }
  if (step === "when") {
    return (
      <p className="mt-3 text-sm text-foreground/70">
        This is a preferred start time. If that time is unavailable, we can look at nearby times.
      </p>
    );
  }
  return null;
}

function StepBody({
  step,
  answers,
  attractions,
  errorId,
  onEdit,
  onToggleAttraction,
}: {
  step: PlannerStep;
  answers: PlannerAnswers;
  attractions: PublicPlannerAttraction[];
  errorId?: string;
  onEdit: (patch: Partial<PlannerAnswers>) => void;
  onToggleAttraction: (id: string) => void;
}) {
  if (step === "event") {
    return (
      <ChoiceGroup legend={PLANNER_STEP_TITLES.event} errorId={errorId}>
        {publicEventTypeOptions().map((option) => (
          <ChoiceCard
            key={option}
            label={option}
            selected={answers.eventType === option}
            onClick={() => onEdit({ eventType: option })}
          />
        ))}
      </ChoiceGroup>
    );
  }

  if (step === "guests") {
    return (
      <label className="block text-sm font-medium text-foreground" htmlFor="guest-count">
        Guest count
        <input
          id="guest-count"
          inputMode="numeric"
          autoComplete="off"
          value={answers.guestCount}
          aria-invalid={Boolean(errorId)}
          aria-describedby={errorId}
          className={INPUT_CLASS}
          onChange={(event) => onEdit({ guestCount: event.target.value })}
        />
      </label>
    );
  }

  if (step === "mix") {
    return (
      <ChoiceGroup legend={PLANNER_STEP_TITLES.mix} errorId={errorId}>
        {INTAKE_GUEST_MIX_VALUES.map((value) => (
          <ChoiceCard
            key={value}
            label={INTAKE_GUEST_MIX_LABELS[value]}
            selected={answers.guestMix === value}
            onClick={() => onEdit({ guestMix: value })}
          />
        ))}
      </ChoiceGroup>
    );
  }

  if (step === "attractions") {
    return (
      <ChoiceGroup legend={PLANNER_STEP_TITLES.attractions}>
        {attractions.length === 0 ? (
          <p className="text-sm text-foreground/70">
            This venue has not listed specific activities here. Continue and we&apos;ll recommend from its usual options.
          </p>
        ) : (
          attractions.map((item) => (
            <ChoiceCard
              key={item.id}
              label={formatCustomerDurationText(item.name)}
              description={item.description}
              selected={answers.attractionInterestIds.includes(item.id)}
              onClick={() => onToggleAttraction(item.id)}
            />
          ))
        )}
      </ChoiceGroup>
    );
  }

  if (step === "food") {
    return (
      <ChoiceGroup legend={PLANNER_STEP_TITLES.food} errorId={errorId}>
        {FOOD_PREFERENCE_VALUES.map((value) => (
          <ChoiceCard
            key={value}
            label={FOOD_PREFERENCE_LABELS[value]}
            selected={answers.foodPreference === value}
            onClick={() => onEdit({ foodPreference: value })}
          />
        ))}
      </ChoiceGroup>
    );
  }

  if (step === "space") {
    return (
      <ChoiceGroup legend={PLANNER_STEP_TITLES.space} errorId={errorId}>
        {PRIVATE_SPACE_PREFERENCE_VALUES.map((value) => (
          <ChoiceCard
            key={value}
            label={PRIVATE_SPACE_PREFERENCE_LABELS[value]}
            selected={answers.privateSpacePreference === value}
            onClick={() => onEdit({ privateSpacePreference: value })}
          />
        ))}
      </ChoiceGroup>
    );
  }

  if (step === "budget") {
    return (
      <ChoiceGroup legend={PLANNER_STEP_TITLES.budget} errorId={errorId}>
        {BUDGET_BAND_VALUES.map((value) => (
          <ChoiceCard
            key={value}
            label={BUDGET_BAND_LABELS[value]}
            selected={answers.budgetBand === value}
            onClick={() => onEdit({ budgetBand: value, budgetPreference: "" })}
          />
        ))}
        <ChoiceCard
          label={BUDGET_PREFERENCE_LABELS.FLEXIBLE}
          selected={answers.budgetPreference === "FLEXIBLE"}
          onClick={() => onEdit({ budgetBand: "", budgetPreference: "FLEXIBLE" })}
        />
      </ChoiceGroup>
    );
  }

  if (step === "when") {
    return (
      <fieldset className="grid gap-4" aria-describedby={errorId}>
        <legend className="sr-only">{PLANNER_STEP_TITLES.when}</legend>
        <label className="block text-sm font-medium text-foreground" htmlFor="event-date">
          Event date
          <input
            id="event-date"
            type="date"
            value={answers.eventDate}
            aria-invalid={Boolean(errorId)}
            className={INPUT_CLASS}
            onChange={(event) => onEdit({ eventDate: event.target.value })}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <TimeSelect
            id="start-hour"
            label="Hour"
            value={answers.startHour}
            onChange={(startHour) => onEdit({ startHour })}
          >
            {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((hour) => (
              <option key={hour} value={hour}>
                {hour}
              </option>
            ))}
          </TimeSelect>
          <TimeSelect
            id="start-minute"
            label="Minute"
            value={answers.startMinute}
            onChange={(startMinute) => onEdit({ startMinute })}
          >
            {["00", "15", "30", "45"].map((minute) => (
              <option key={minute} value={minute}>
                {minute}
              </option>
            ))}
          </TimeSelect>
          <TimeSelect
            id="start-period"
            label="AM/PM"
            value={answers.startPeriod}
            onChange={(startPeriod) => onEdit({ startPeriod: startPeriod as "AM" | "PM" | "" })}
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </TimeSelect>
        </div>
      </fieldset>
    );
  }

  return null;
}

function ChoiceGroup({
  legend,
  errorId,
  children,
}: {
  legend: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="grid gap-3" aria-describedby={errorId}>
      <legend className="sr-only">{legend}</legend>
      {children}
    </fieldset>
  );
}

function ChoiceCard({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description?: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={selected} className={selectedCardClass(selected)} onClick={onClick}>
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{label}</span>
        {description ? <span className="mt-1 block text-sm text-foreground/70">{description}</span> : null}
      </span>
      {selected ? <span className="shrink-0 text-sm font-semibold text-primary">Selected</span> : null}
    </button>
  );
}

function TimeSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-foreground" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        className={`${INPUT_CLASS} cursor-pointer`}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose</option>
        {children}
      </select>
    </label>
  );
}

function ContactField({
  label,
  name,
  value,
  onChange,
  error,
  disabled,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled: boolean;
  type?: string;
  autoComplete?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <label className="block text-sm font-medium text-foreground" htmlFor={name}>
      {label}
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={INPUT_CLASS}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span id={errorId} role="alert" className="mt-1 block text-sm font-normal text-destructive">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function ReviewList({
  answers,
  attractionNames,
  onEdit,
}: {
  answers: PlannerAnswers;
  attractionNames: Map<string, string>;
  onEdit: (step: PlannerStep) => void;
}) {
  const attractions =
    answers.attractionInterestIds.length > 0
      ? answers.attractionInterestIds
          .map((id) => formatCustomerDurationText(attractionNames.get(id) ?? "Selected activity"))
          .join(", ")
      : "We'll recommend options";
  const rows: Array<{ label: string; value: string; step: PlannerStep }> = [
    { label: "Event", value: answers.eventType, step: "event" },
    { label: "Guests", value: answers.guestCount ? `${answers.guestCount} guests` : "", step: "guests" },
    { label: "Group", value: answers.guestMix ? INTAKE_GUEST_MIX_LABELS[answers.guestMix] : "", step: "mix" },
    { label: "Interested in", value: attractions, step: "attractions" },
    {
      label: "Food",
      value: answers.foodPreference ? FOOD_PREFERENCE_LABELS[answers.foodPreference] : "",
      step: "food",
    },
    {
      label: "Private space",
      value: answers.privateSpacePreference ? PRIVATE_SPACE_PREFERENCE_LABELS[answers.privateSpacePreference] : "",
      step: "space",
    },
    {
      label: "Budget",
      value: intakeBudgetLabel(answers),
      step: "budget",
    },
    { label: "Preferred date and time", value: formatPreferredDateTime(answers), step: "when" },
  ];

  return (
    <dl className="divide-y divide-border rounded-xl border border-border bg-background">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-4 px-4 py-3">
          <div>
            <dt className="text-xs font-medium tracking-wide text-foreground/60 uppercase">{row.label}</dt>
            <dd className="mt-1 text-sm text-foreground">{row.value}</dd>
          </div>
          <button
            type="button"
            className="cursor-pointer text-sm font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={() => onEdit(row.step)}
          >
            Edit {row.label}
          </button>
        </div>
      ))}
    </dl>
  );
}
