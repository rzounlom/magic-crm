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
  contactFieldErrors,
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
import { formatPhoneDisplay, formatUsPhoneInput } from "@/lib/inquiries/public-phone";
import { onSafeSubmitAttempt } from "@/lib/ui/confirm-gate";
import { notify } from "@/lib/ui/notify";
import { yieldToPaint } from "@/lib/ui/yield-to-paint";
import { submitPublicInquiryAction } from "@/server/actions/public-inquiry";
import { readPublicIntakeFields } from "@/server/inquiries/intake-validation";
import { BUDGET_BAND_LABELS, BUDGET_BAND_VALUES, PUBLIC_EVENT_LENGTH_OPTIONS } from "@/types/event-planner";
import type { SecurityActionResult } from "@/types/security-action";

export type PublicPlannerAttraction = { id: string; name: string; description?: string | null };

const CARD_CLASS =
  "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const INPUT_CLASS =
  "mt-2 rounded-xl border border-border bg-background px-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed";
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
    if (state.step === "contact") {
      setContactErrors(contactFieldErrors(state.answers));
    }
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
      dispatch({ type: "go", step: "contact" });
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
        const contactKeys = ["firstName", "lastName", "email", "phone", "customerGroupName", "notes"];
        if (contactKeys.some((key) => result.fieldErrors?.[key])) {
          dispatch({ type: "go", step: "contact" });
        }
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
          <input
            type="hidden"
            name="desiredDurationMinutes"
            value={
              state.answers.desiredDurationMinutes === "FLEXIBLE" ? "" : state.answers.desiredDurationMinutes
            }
          />
          {state.answers.attractionInterestIds.map((id) => (
            <input key={id} type="hidden" name="attractionInterestIds" value={id} />
          ))}
          <input type="hidden" name="firstName" value={state.answers.firstName} />
          <input type="hidden" name="lastName" value={state.answers.lastName} />
          <input type="hidden" name="email" value={state.answers.email} />
          <input type="hidden" name="phone" value={state.answers.phone} />
          <input type="hidden" name="customerGroupName" value={state.answers.customerGroupName} />
          <input type="hidden" name="notes" value={state.answers.notes} />
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
      </form>
    ) : (
      <StepBody
        step={state.step}
        answers={state.answers}
        attractions={attractions}
        errorId={stepError ? `${state.step}-error` : undefined}
        fieldErrors={contactErrors}
        disabled={pending}
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
        className="mx-auto flex h-fit max-h-full min-h-0 w-full max-w-272 flex-col overflow-hidden px-2"
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
        {stepError && state.step !== "contact" ? (
          <p id={`${state.step}-error`} role="alert" className="mt-4 shrink-0 text-sm text-destructive">
            {stepError}
          </p>
        ) : null}

        <div data-planner-scroll className="public-scroll min-h-0 overflow-y-auto overscroll-contain pt-4">
          {scrollBody}
        </div>

        <div
          data-planner-actions
          className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background pt-6"
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
  if (step === "length") {
    return (
      <p className="mt-3 text-sm text-foreground/70">
        This is how long you&apos;d like to be here. We&apos;ll use it as a preference when we build options. It is not a
        guaranteed schedule.
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
  if (step === "contact") {
    return (
      <p className="mt-3 text-sm text-foreground/70">
        We&apos;ll use this to send your event options. Review comes next.
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
  fieldErrors,
  disabled,
  onEdit,
  onToggleAttraction,
}: {
  step: PlannerStep;
  answers: PlannerAnswers;
  attractions: PublicPlannerAttraction[];
  errorId?: string;
  fieldErrors: Record<string, string>;
  disabled: boolean;
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
      <label className="block w-full text-sm font-medium text-foreground sm:max-w-xs" htmlFor="guest-count">
        <span className="block">Guest count</span>
        <input
          id="guest-count"
          inputMode="numeric"
          autoComplete="off"
          maxLength={3}
          value={answers.guestCount}
          aria-invalid={Boolean(errorId)}
          aria-describedby={errorId}
          className={`${INPUT_CLASS} w-full`}
          onChange={(event) => onEdit({ guestCount: event.target.value.replace(/\D/g, "").slice(0, 3) })}
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

  if (step === "length") {
    return (
      <ChoiceGroup legend={PLANNER_STEP_TITLES.length} errorId={errorId}>
        {PUBLIC_EVENT_LENGTH_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            label={option.label}
            selected={answers.desiredDurationMinutes === option.value}
            onClick={() => onEdit({ desiredDurationMinutes: option.value })}
          />
        ))}
      </ChoiceGroup>
    );
  }

  if (step === "when") {
    return (
      <fieldset className="grid min-w-0 gap-6" aria-describedby={errorId}>
        <legend className="sr-only">{PLANNER_STEP_TITLES.when}</legend>
        <label className="block w-full text-sm font-medium text-foreground sm:max-w-90" htmlFor="event-date">
          <span className="block">Event date</span>
          <input
            id="event-date"
            type="date"
            value={answers.eventDate}
            aria-invalid={Boolean(errorId)}
            className={`${INPUT_CLASS} w-full min-w-0 max-w-full cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer`}
            onChange={(event) => onEdit({ eventDate: event.target.value })}
          />
        </label>
        <fieldset className="min-w-0">
          <legend className="text-sm font-medium text-foreground">Preferred start time</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            <TimeSelect
              id="start-hour"
              label="Hour"
              widthClass="w-[5.5rem]"
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
              widthClass="w-[5.5rem]"
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
              widthClass="w-24"
              value={answers.startPeriod}
              onChange={(startPeriod) => onEdit({ startPeriod: startPeriod as "AM" | "PM" | "" })}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </TimeSelect>
          </div>
        </fieldset>
      </fieldset>
    );
  }

  if (step === "contact") {
    return (
      <div className="grid min-w-0 gap-4 pb-2 sm:grid-cols-2">
        <ContactField
          label="First name"
          name="firstName"
          value={answers.firstName}
          autoComplete="given-name"
          disabled={disabled}
          error={fieldErrors.firstName}
          onChange={(value) => onEdit({ firstName: value })}
        />
        <ContactField
          label="Last name"
          name="lastName"
          value={answers.lastName}
          autoComplete="family-name"
          disabled={disabled}
          error={fieldErrors.lastName}
          onChange={(value) => onEdit({ lastName: value })}
        />
        <ContactField
          label="Email"
          name="email"
          type="email"
          value={answers.email}
          autoComplete="email"
          disabled={disabled}
          error={fieldErrors.email}
          onChange={(value) => onEdit({ email: value })}
        />
        <ContactField
          label="Phone (optional)"
          name="phone"
          type="tel"
          value={answers.phone}
          autoComplete="tel"
          disabled={disabled}
          error={fieldErrors.phone}
          onChange={(value) => onEdit({ phone: formatUsPhoneInput(value) })}
        />
        <ContactField
          label="Group or company name (optional)"
          name="customerGroupName"
          value={answers.customerGroupName}
          disabled={disabled}
          error={fieldErrors.customerGroupName}
          onChange={(value) => onEdit({ customerGroupName: value })}
        />
        <label className="block min-w-0 text-sm font-medium text-foreground sm:col-span-2">
          Notes (optional)
          <textarea
            name="notes"
            value={answers.notes}
            disabled={disabled}
            rows={3}
            className={`${INPUT_CLASS} w-full`}
            onChange={(event) => onEdit({ notes: event.target.value })}
          />
        </label>
      </div>
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
    <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2" aria-describedby={errorId}>
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
  widthClass,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  widthClass: string;
  children: ReactNode;
}) {
  return (
    <label className={`block text-xs font-medium tracking-wide text-foreground/70 uppercase ${widthClass}`} htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        className={`${INPUT_CLASS} w-full cursor-pointer`}
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
    <div className="min-w-0">
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
          className={`${INPUT_CLASS} w-full`}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {error ? (
        <span id={errorId} role="alert" className="mt-1 block text-sm font-normal text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function contactSummary(answers: PlannerAnswers): string {
  const name = [answers.firstName.trim(), answers.lastName.trim()].filter(Boolean).join(" ");
  return [name, answers.email.trim(), formatPhoneDisplay(answers.phone), answers.customerGroupName.trim(), answers.notes.trim()]
    .filter(Boolean)
    .join(" · ");
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
    {
      label: "Event length",
      value:
        PUBLIC_EVENT_LENGTH_OPTIONS.find((option) => option.value === answers.desiredDurationMinutes)?.label ?? "",
      step: "length",
    },
    { label: "Preferred date and time", value: formatPreferredDateTime(answers), step: "when" },
    { label: "Contact information", value: contactSummary(answers), step: "contact" },
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
