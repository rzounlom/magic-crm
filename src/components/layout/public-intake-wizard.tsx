"use client";

import { useRouter } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { PUBLIC_INQUIRY_PENDING_COPY } from "@/components/layout/public-inquiry-pending";
import { BlockingMutation } from "@/components/ui/blocking-mutation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PendingActionProvider, PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  clearIntakeDraft,
  readIntakeDraft,
  writeIntakeDraft,
} from "@/lib/event-planner/intake-draft";
import {
  BUDGET_PREFERENCE_LABELS,
  FOOD_PREFERENCE_LABELS,
  FOOD_PREFERENCE_VALUES,
  INTAKE_GUEST_MIX_LABELS,
  INTAKE_GUEST_MIX_VALUES,
  PRIVATE_SPACE_PREFERENCE_LABELS,
  PRIVATE_SPACE_PREFERENCE_VALUES,
  contactFieldErrors,
  formatPreferredDateTime,
  initialPlannerState,
  intakeBudgetLabel,
  plannerAnswersToIntakeRecord,
  plannerStepError,
  publicEventTypeOptions,
  reducePlanner,
  to24HourTime,
  type PlannerAnswers,
  type PlannerStep,
} from "@/lib/event-planner/intake-contract";
import {
  EVENT_TYPE_HELP,
  JOURNEY_STEPS,
  answersFromStartTime24,
  journeyIndex,
  journeyStepError,
  publicStartTimeOptions,
  startTimeFromAnswers,
  type JourneyStepId,
} from "@/lib/event-planner/intake-journey";
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

const INPUT_CLASS =
  "mt-2 w-full min-h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3 py-3 text-base sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed";

const PRIMARY_BUTTON =
  "inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-[var(--radius-control)] bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed sm:w-auto";

const SECONDARY_BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed";

/** Secondary utility — never compete with Continue on mobile. */
const START_OVER_BUTTON =
  "inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] px-2.5 py-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-destructive hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed";

const START_TIME_OPTIONS = publicStartTimeOptions();

function journeySectionId(step: JourneyStepId): string {
  return `planner-section-${step}`;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function focusJourneySection(step: JourneyStepId, options?: { scroll?: boolean }) {
  const node = document.getElementById(journeySectionId(step));
  if (!(node instanceof HTMLElement)) {
    return;
  }
  if (!node.hasAttribute("tabindex")) {
    node.tabIndex = -1;
  }
  node.focus({ preventScroll: !options?.scroll });
  if (options?.scroll) {
    node.scrollIntoView?.({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "nearest",
    });
  }
}

function journeyStepForPlannerStep(step: PlannerStep): JourneyStepId {
  if (step === "event" || step === "guests" || step === "mix") {
    return "event";
  }
  if (step === "attractions" || step === "food" || step === "space" || step === "budget" || step === "length") {
    return "fun";
  }
  if (step === "when") {
    return "when";
  }
  return "details";
}

export function PublicIntakeWizard({
  organizationSlug,
  attractions = [],
  attractionRequiredGuestMixes = [],
  action = submitPublicInquiryAction,
}: {
  organizationSlug: string;
  attractions?: PublicPlannerAttraction[];
  /** Guest mixes whose tenant profile refuses an empty attraction list. */
  attractionRequiredGuestMixes?: Array<(typeof INTAKE_GUEST_MIX_VALUES)[number]>;
  action?: (formData: FormData) => Promise<SecurityActionResult>;
}) {
  const router = useRouter();
  const honeypotId = useId();
  const pendingRef = useRef(false);
  const draftReady = useRef(false);
  const draftHydrated = useRef(false);
  const pendingFocus = useRef<{ step: JourneyStepId; scroll?: boolean } | null>(null);
  const [state, dispatch] = useReducer(reducePlanner, undefined, initialPlannerState);
  const [journeyStep, setJourneyStep] = useState<JourneyStepId>("event");
  const [showError, setShowError] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const [pending, setPending] = useState(false);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [draftRestored, setDraftRestored] = useState(false);
  const [focusTick, setFocusTick] = useState(0);

  const catalogAttractionIds = useMemo(() => new Set(attractions.map((item) => item.id)), [attractions]);
  const attractionNames = useMemo(
    () => new Map(attractions.map((item) => [item.id, item.name])),
    [attractions],
  );
  const answers = state.answers;
  const startTime = to24HourTime(answers.startHour, answers.startMinute, answers.startPeriod) ?? "";
  const attractionRequired = (attractionRequiredGuestMixes as readonly string[]).includes(answers.guestMix);
  const stepIndex = journeyIndex(journeyStep);
  const progressLabel = `Step ${stepIndex + 1} of ${JOURNEY_STEPS.length}: ${JOURNEY_STEPS[stepIndex]?.label ?? ""}`;

  function requestFocus(step: JourneyStepId, options?: { scroll?: boolean }) {
    pendingFocus.current = { step, scroll: options?.scroll };
    setFocusTick((tick) => tick + 1);
  }

  useEffect(() => {
    if (draftHydrated.current) {
      return;
    }
    draftHydrated.current = true;
    const restored = readIntakeDraft(organizationSlug, catalogAttractionIds);
    // Defer so hydrate is an external-store callback, not a sync effect setState.
    queueMicrotask(() => {
      if (restored) {
        dispatch({ type: "edit", patch: restored.answers });
        setDraftRestored(true);
      }
      draftReady.current = true;
    });
    // Restore once per mount for this tenant slug.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot hydrate
  }, [organizationSlug]);

  useEffect(() => {
    if (!draftReady.current) {
      return;
    }
    const hasPreferences =
      Boolean(answers.eventType) ||
      Boolean(answers.guestCount) ||
      Boolean(answers.guestMix) ||
      answers.attractionInterestIds.length > 0 ||
      Boolean(answers.foodPreference) ||
      Boolean(answers.privateSpacePreference) ||
      Boolean(answers.budgetBand) ||
      Boolean(answers.budgetPreference) ||
      Boolean(answers.desiredDurationMinutes) ||
      Boolean(answers.eventDate) ||
      Boolean(answers.startHour);
    if (!hasPreferences) {
      clearIntakeDraft(organizationSlug);
      return;
    }
    writeIntakeDraft(organizationSlug, answers);
  }, [organizationSlug, answers]);

  useEffect(() => {
    const request = pendingFocus.current;
    if (!request) {
      return;
    }
    pendingFocus.current = null;
    focusJourneySection(request.step, { scroll: request.scroll });
  }, [focusTick, journeyStep]);

  function edit(patch: Partial<PlannerAnswers>) {
    setShowError(false);
    setStepError(null);
    setSubmitError(null);
    dispatch({ type: "edit", patch });
  }

  function goToStep(step: JourneyStepId, options?: { scroll?: boolean }) {
    setJourneyStep(step);
    setShowError(false);
    setStepError(null);
    const scroller = document.querySelector("[data-planner-scroll]");
    if (scroller instanceof HTMLElement) {
      scroller.scrollTop = 0;
    }
    requestFocus(step, options);
  }

  function continueJourney() {
    const error = journeyStepError(journeyStep, answers, { attractionRequired });
    if (error) {
      setShowError(true);
      setStepError(error);
      requestFocus(journeyStep, { scroll: true });
      return;
    }
    const next = JOURNEY_STEPS[Math.min(stepIndex + 1, JOURNEY_STEPS.length - 1)];
    if (next) {
      goToStep(next.id);
    }
  }

  function backJourney() {
    if (stepIndex <= 0) {
      return;
    }
    const previous = JOURNEY_STEPS[stepIndex - 1];
    if (previous) {
      goToStep(previous.id);
    }
  }

  function editFromReview(step: PlannerStep) {
    goToStep(journeyStepForPlannerStep(step), { scroll: true });
  }

  function confirmReset() {
    clearIntakeDraft(organizationSlug);
    dispatch({ type: "startOver" });
    setJourneyStep("event");
    setSubmissionId(crypto.randomUUID());
    setContactErrors({});
    setShowError(false);
    setStepError(null);
    setSubmitError(null);
    setDraftRestored(false);
    setConfirmStartOver(false);
    requestFocus("event");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onSafeSubmitAttempt(pendingRef.current) === "block") {
      return;
    }

    for (const step of JOURNEY_STEPS) {
      const error = journeyStepError(step.id, answers, { attractionRequired });
      if (error) {
        setShowError(true);
        setStepError(error);
        setSubmitError(error);
        if (step.id === "details") {
          setContactErrors(contactFieldErrors(answers));
        }
        goToStep(step.id, { scroll: true });
        return;
      }
    }

    const formData = new FormData(event.currentTarget);
    const clientCheck = readPublicIntakeFields({
      ...plannerAnswersToIntakeRecord(
        {
          ...answers,
          firstName: String(formData.get("firstName") ?? answers.firstName),
          lastName: String(formData.get("lastName") ?? answers.lastName),
          email: String(formData.get("email") ?? answers.email),
          phone: String(formData.get("phone") ?? answers.phone),
          customerGroupName: String(formData.get("customerGroupName") ?? answers.customerGroupName),
          notes: String(formData.get("notes") ?? answers.notes),
        },
        submissionId,
      ),
      companyWebsite: String(formData.get("companyWebsite") ?? ""),
    });
    if (!clientCheck.success) {
      setContactErrors(clientCheck.fieldErrors);
      setShowError(true);
      setSubmitError("Please fix the highlighted fields.");
      goToStep("details", { scroll: true });
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setContactErrors({});
    setSubmitError(null);
    await yieldToPaint();

    let keepPending = false;
    try {
      const result = await action(formData);
      if (!result.ok) {
        setContactErrors(result.fieldErrors ?? {});
        const contactKeys = ["firstName", "lastName", "email", "phone", "customerGroupName", "notes"];
        if (contactKeys.some((key) => result.fieldErrors?.[key])) {
          goToStep("details", { scroll: true });
        }
        const message = result.message ?? "Unable to send inquiry";
        setSubmitError(message);
        notify.error({
          title: result.title ?? "Unable to send inquiry",
          description: message,
        });
        return;
      }
      clearIntakeDraft(organizationSlug);
      if (result.redirectTo) {
        keepPending = true;
        router.push(result.redirectTo);
        return;
      }
    } catch (error) {
      unstable_rethrow(error);
      setSubmitError("Something went wrong. Try again.");
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

  function adjustGuests(delta: number) {
    const current = Number(answers.guestCount);
    const base = Number.isInteger(current) && current > 0 ? current : 0;
    const next = Math.min(999, Math.max(0, base + delta));
    edit({ guestCount: next === 0 ? "" : String(next) });
  }

  return (
    <>
      <PendingActionProvider pending={pending}>
        <div data-planner-shell aria-busy={pending} inert={pending ? true : undefined} className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <JourneyProgress current={journeyStep} />
            <button
              type="button"
              className={START_OVER_BUTTON}
              onClick={() => setConfirmStartOver(true)}
              disabled={pending}
            >
              Start over
            </button>
          </div>

          <p className="sr-only" aria-live="polite">
            {progressLabel}
          </p>

          <div data-planner-scroll className="public-scroll min-h-0 flex-1 overflow-y-auto pt-4 pr-2 pb-8">
            {draftRestored ? (
              <div
                role="status"
                data-draft-banner
                className="mb-4 rounded-[var(--radius-control)] border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
              >
                <p>We restored your event preferences from this browser. Contact details were not saved for privacy.</p>
                <button
                  type="button"
                  className="mt-1.5 cursor-pointer text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  onClick={() => setDraftRestored(false)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            <form id="planner-review" aria-busy={pending} onSubmit={onSubmit} noValidate>
              <input type="hidden" name="organizationSlug" value={organizationSlug} />
              <input type="hidden" name="submissionId" value={submissionId} />
              <input type="hidden" name="eventType" value={answers.eventType} />
              <input type="hidden" name="preferredDate" value={answers.eventDate} />
              <input type="hidden" name="startTime" value={startTime} />
              <input type="hidden" name="guestCount" value={answers.guestCount} />
              <input type="hidden" name="guestMix" value={answers.guestMix} />
              <input type="hidden" name="foodPreference" value={answers.foodPreference} />
              <input type="hidden" name="privateSpacePreference" value={answers.privateSpacePreference} />
              <input type="hidden" name="budgetBand" value={answers.budgetBand} />
              <input type="hidden" name="budgetPreference" value={answers.budgetPreference === "FLEXIBLE" ? "FLEXIBLE" : ""} />
              <input
                type="hidden"
                name="desiredDurationMinutes"
                value={answers.desiredDurationMinutes === "FLEXIBLE" ? "" : answers.desiredDurationMinutes}
              />
              {answers.attractionInterestIds.map((id) => (
                <input key={id} type="hidden" name="attractionInterestIds" value={id} />
              ))}
              <input type="hidden" name="firstName" value={answers.firstName} />
              <input type="hidden" name="lastName" value={answers.lastName} />
              <input type="hidden" name="email" value={answers.email} />
              <input type="hidden" name="phone" value={answers.phone} />
              <input type="hidden" name="customerGroupName" value={answers.customerGroupName} />
              <input type="hidden" name="notes" value={answers.notes} />
              <div className="hidden" aria-hidden="true">
                <label htmlFor={honeypotId}>Company website</label>
                <input id={honeypotId} name="companyWebsite" tabIndex={-1} autoComplete="off" />
              </div>

              {showError && stepError ? (
                <div
                  id="planner-error-summary"
                  role="alert"
                  tabIndex={-1}
                  className="mb-4 rounded-[var(--radius-control)] border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive"
                >
                  {stepError}
                </div>
              ) : null}

              {journeyStep === "event" ? (
                <section id={journeySectionId("event")} tabIndex={-1} className="planner-section outline-none">
                  <SectionHeading
                    title="Your event"
                    detail="Choose the kind of gathering you're planning, then tell us about your group."
                  />
                  <ChoiceGroup legend="What are you planning?">
                    {publicEventTypeOptions().map((option) => (
                      <EventTypeCard
                        key={option}
                        label={option}
                        description={EVENT_TYPE_HELP[option]}
                        selected={answers.eventType === option}
                        onClick={() => edit({ eventType: option })}
                      />
                    ))}
                  </ChoiceGroup>

                  {answers.eventType ? (
                    <div className="mt-8 grid gap-6">
                      <div>
                        <label className="block text-sm font-medium text-foreground" htmlFor="guest-count">
                          Guest count
                        </label>
                        <p id="guest-count-hint" className="mt-1 text-sm text-muted-foreground">
                          About how many people are you planning for? An estimate is fine.
                        </p>
                        <div className="mt-2 flex max-w-xs items-stretch gap-2">
                          <button
                            type="button"
                            className={`${SECONDARY_BUTTON} min-w-11 px-0`}
                            aria-label="Decrease"
                            onClick={() => adjustGuests(-1)}
                          >
                            −
                          </button>
                          <input
                            id="guest-count"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={3}
                            value={answers.guestCount}
                            aria-invalid={showError && Boolean(plannerStepError("guests", answers))}
                            aria-describedby={
                              showError && plannerStepError("guests", answers)
                                ? "guest-count-hint guest-count-error"
                                : "guest-count-hint"
                            }
                            className={`${INPUT_CLASS} mt-0 text-center text-lg font-semibold`}
                            onChange={(event) =>
                              edit({ guestCount: event.target.value.replace(/\D/g, "").slice(0, 3) })
                            }
                          />
                          <button
                            type="button"
                            className={`${SECONDARY_BUTTON} min-w-11 px-0`}
                            aria-label="Increase"
                            onClick={() => adjustGuests(1)}
                          >
                            +
                          </button>
                        </div>
                        {showError && plannerStepError("guests", answers) ? (
                          <p id="guest-count-error" role="alert" className="mt-2 text-sm text-destructive">
                            {plannerStepError("guests", answers)}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">Who&apos;s coming?</h3>
                        <div className="mt-3">
                          <ChoiceGroup legend="Who's coming?" compact>
                            {INTAKE_GUEST_MIX_VALUES.map((value) => (
                              <ChoiceCard
                                key={value}
                                label={INTAKE_GUEST_MIX_LABELS[value]}
                                selected={answers.guestMix === value}
                                onClick={() => edit({ guestMix: value })}
                              />
                            ))}
                          </ChoiceGroup>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {journeyStep === "fun" ? (
                <section id={journeySectionId("fun")} tabIndex={-1} className="planner-section outline-none">
                  <SectionHeading
                    title="The fun stuff"
                    detail={
                      attractionRequired
                        ? "Pick at least one activity for this group, then share a few preferences. Selecting an activity does not reserve capacity."
                        : "Choose activities your group might enjoy — you can continue without selecting any. Preferences guide recommendations; nothing is reserved."
                    }
                  />

                  <PreferenceBlock
                    title="Activities"
                    detail={
                      attractions.length > 1
                        ? "You can select more than one."
                        : attractions.length === 1
                          ? "Select this activity if you're interested."
                          : undefined
                    }
                  >
                    <ChoiceGroup legend="What would your group like to do?">
                      {attractions.length === 0 ? (
                        <p className="text-sm text-muted-foreground sm:col-span-2">
                          This venue has not listed specific activities here. Continue and we&apos;ll recommend from its
                          usual options.
                        </p>
                      ) : (
                        attractions.map((item) => (
                          <ChoiceCard
                            key={item.id}
                            label={formatCustomerDurationText(item.name)}
                            description={
                              item.description?.trim()
                                ? item.description
                                : "Available at this venue — we'll confirm details in your options."
                            }
                            selected={answers.attractionInterestIds.includes(item.id)}
                            onClick={() => {
                              setStepError(null);
                              dispatch({ type: "toggleAttraction", id: item.id });
                            }}
                          />
                        ))
                      )}
                    </ChoiceGroup>
                  </PreferenceBlock>

                  <PreferenceBlock title="Food" detail="Would you like food included?">
                    <ChoiceGroup legend="Food" compact>
                      {FOOD_PREFERENCE_VALUES.map((value) => (
                        <ChoiceCard
                          key={value}
                          label={FOOD_PREFERENCE_LABELS[value]}
                          accessibleName={`Food: ${FOOD_PREFERENCE_LABELS[value]}`}
                          selected={answers.foodPreference === value}
                          onClick={() => edit({ foodPreference: value })}
                        />
                      ))}
                    </ChoiceGroup>
                  </PreferenceBlock>

                  <PreferenceBlock title="Private space" detail="Would you like a private event space?">
                    <ChoiceGroup legend="Private space" compact>
                      {PRIVATE_SPACE_PREFERENCE_VALUES.map((value) => (
                        <ChoiceCard
                          key={value}
                          label={PRIVATE_SPACE_PREFERENCE_LABELS[value]}
                          accessibleName={`Private space: ${PRIVATE_SPACE_PREFERENCE_LABELS[value]}`}
                          selected={answers.privateSpacePreference === value}
                          onClick={() => edit({ privateSpacePreference: value })}
                        />
                      ))}
                    </ChoiceGroup>
                  </PreferenceBlock>

                  <PreferenceBlock
                    title="Budget"
                    detail="Total for the event — guides recommendations only, not a quote or cap."
                  >
                    <ChoiceGroup legend="Budget" compact>
                      {BUDGET_BAND_VALUES.map((value) => (
                        <ChoiceCard
                          key={value}
                          label={BUDGET_BAND_LABELS[value]}
                          selected={answers.budgetBand === value}
                          onClick={() => edit({ budgetBand: value, budgetPreference: "" })}
                        />
                      ))}
                      <ChoiceCard
                        label={BUDGET_PREFERENCE_LABELS.FLEXIBLE}
                        selected={answers.budgetPreference === "FLEXIBLE"}
                        onClick={() => edit({ budgetBand: "", budgetPreference: "FLEXIBLE" })}
                      />
                    </ChoiceGroup>
                  </PreferenceBlock>

                  <PreferenceBlock
                    title="Event length"
                    detail="A preference for building options — not a guaranteed schedule."
                  >
                    <ChoiceGroup legend="Event length" compact>
                      {PUBLIC_EVENT_LENGTH_OPTIONS.map((option) => (
                        <ChoiceCard
                          key={option.value}
                          label={option.label}
                          selected={answers.desiredDurationMinutes === option.value}
                          onClick={() => edit({ desiredDurationMinutes: option.value })}
                        />
                      ))}
                    </ChoiceGroup>
                  </PreferenceBlock>
                </section>
              ) : null}

              {journeyStep === "when" ? (
                <section id={journeySectionId("when")} tabIndex={-1} className="planner-section outline-none">
                  <SectionHeading
                    title="When"
                    detail="Pick a preferred date and start time at the venue. Times are preferences only — not a reservation or confirmed availability."
                  />
                  <div className="grid gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                    <label className="block text-sm font-medium text-foreground" htmlFor="event-date">
                      Event date
                      <input
                        id="event-date"
                        type="date"
                        value={answers.eventDate}
                        className={`${INPUT_CLASS} cursor-pointer`}
                        onChange={(event) => edit({ eventDate: event.target.value })}
                      />
                    </label>
                    <label className="block text-sm font-medium text-foreground" htmlFor="start-time">
                      Preferred start time
                      <select
                        id="start-time"
                        value={startTimeFromAnswers(answers)}
                        className={`${INPUT_CLASS} cursor-pointer`}
                        onChange={(event) => edit(answersFromStartTime24(event.target.value))}
                      >
                        <option value="">Choose a time</option>
                        {START_TIME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-sm text-muted-foreground">
                      Times are venue-local wall clock (including late evening and overnight preferences). Choosing a
                      time does not mean it is available.
                    </p>
                  </div>
                </section>
              ) : null}

              {journeyStep === "details" ? (
                <section id={journeySectionId("details")} tabIndex={-1} className="planner-section outline-none">
                  <SectionHeading
                    title="Your details"
                    detail="We'll use this to send your event options. Submitting an inquiry does not reserve activities or collect payment."
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <ContactField
                      label="First name"
                      name="firstName"
                      value={answers.firstName}
                      autoComplete="given-name"
                      disabled={pending}
                      error={contactErrors.firstName}
                      onChange={(value) => edit({ firstName: value })}
                    />
                    <ContactField
                      label="Last name"
                      name="lastName"
                      value={answers.lastName}
                      autoComplete="family-name"
                      disabled={pending}
                      error={contactErrors.lastName}
                      onChange={(value) => edit({ lastName: value })}
                    />
                    <ContactField
                      label="Email"
                      name="email"
                      type="email"
                      value={answers.email}
                      autoComplete="email"
                      disabled={pending}
                      error={contactErrors.email}
                      onChange={(value) => edit({ email: value })}
                    />
                    <ContactField
                      label="Phone (optional)"
                      name="phone"
                      type="tel"
                      value={answers.phone}
                      autoComplete="tel"
                      disabled={pending}
                      error={contactErrors.phone}
                      onChange={(value) => edit({ phone: formatUsPhoneInput(value) })}
                    />
                    <ContactField
                      label="Group or company name (optional)"
                      name="customerGroupName"
                      value={answers.customerGroupName}
                      disabled={pending}
                      error={contactErrors.customerGroupName}
                      onChange={(value) => edit({ customerGroupName: value })}
                    />
                    <label className="block text-sm font-medium text-foreground sm:col-span-2" htmlFor="notes">
                      Notes (optional)
                      <textarea
                        id="notes"
                        name="notes"
                        value={answers.notes}
                        disabled={pending}
                        rows={3}
                        className={INPUT_CLASS}
                        onChange={(event) => edit({ notes: event.target.value })}
                      />
                    </label>
                  </div>

                  <div className="mt-8">
                    <h3 className="text-base font-semibold text-foreground">Review your answers</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Edit any section before you send.</p>
                    <div className="mt-3">
                      <ReviewList answers={answers} attractionNames={attractionNames} onEdit={editFromReview} />
                    </div>
                  </div>

                  {submitError ? (
                    <div
                      role="alert"
                      className="mt-4 rounded-[var(--radius-control)] border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive"
                    >
                      {submitError}
                    </div>
                  ) : null}

                  <p className="mt-4 text-sm text-muted-foreground">
                    Building these options does not book your event, hold a time, or collect payment.
                  </p>
                </section>
              ) : null}

              <div className="planner-stage-actions flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                {stepIndex > 0 ? (
                  <button type="button" className={SECONDARY_BUTTON} onClick={backJourney} disabled={pending}>
                    Back
                  </button>
                ) : (
                  <span />
                )}
                {journeyStep === "details" ? (
                  <PendingSubmitButton form="planner-review" pendingLabel={PUBLIC_INQUIRY_PENDING_COPY} className={PRIMARY_BUTTON}>
                    Build my event options
                  </PendingSubmitButton>
                ) : (
                  <button type="button" className={PRIMARY_BUTTON} onClick={continueJourney} disabled={pending}>
                    Continue
                  </button>
                )}
              </div>
            </form>
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

function JourneyProgress({ current }: { current: JourneyStepId }) {
  const currentIndex = journeyIndex(current);
  return (
    <ol
      data-planner-progress
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2"
      aria-label="Planner progress"
    >
      {JOURNEY_STEPS.map((step, index) => {
        const active = step.id === current;
        const done = index < currentIndex;
        return (
          <li
            key={step.id}
            aria-current={active ? "step" : undefined}
            className={`rounded-full px-2.5 py-1 text-[0.65rem] font-bold tracking-[0.08em] uppercase sm:text-xs ${
              active ? "bg-primary/10 text-primary" : done ? "bg-muted text-foreground" : "text-muted-foreground"
            }`}
          >
            {step.shortLabel}
          </li>
        );
      })}
    </ol>
  );
}

function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      {detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function PreferenceBlock({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <div className="preference-block">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function ChoiceGroup({
  legend,
  children,
  compact = false,
}: {
  legend: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <fieldset data-choice-grid className={compact ? "choice-grid choice-grid-compact" : "choice-grid"}>
      <legend className="sr-only">{legend}</legend>
      {children}
    </fieldset>
  );
}

function ChoiceCard({
  label,
  description,
  selected,
  accessibleName,
  onClick,
}: {
  label: string;
  description?: string | null;
  selected: boolean;
  accessibleName?: string;
  onClick: () => void;
}) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={accessibleName ?? label}
      aria-describedby={description ? descriptionId : undefined}
      className="choice-card flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] px-4 py-3.5 text-left"
      onClick={onClick}
    >
      <span className="min-w-0">
        <span className="block font-medium text-foreground" aria-hidden="true">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="mt-1 block text-sm text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {selected ? (
        <span className="shrink-0 text-sm font-semibold text-primary" aria-hidden="true">
          Selected
        </span>
      ) : null}
    </button>
  );
}

function EventTypeCard({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
}) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      aria-describedby={description ? descriptionId : undefined}
      className="choice-card event-type-card flex min-h-[4.5rem] w-full cursor-pointer items-start gap-3 rounded-[var(--radius-control)] px-4 py-3.5 text-left"
      onClick={onClick}
    >
      <EventTypeIcon label={label} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground" aria-hidden="true">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="mt-1 block text-sm text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {selected ? (
        <span className="shrink-0 text-sm font-semibold text-primary" aria-hidden="true">
          Selected
        </span>
      ) : null}
    </button>
  );
}

function EventTypeIcon({ label }: { label: string }) {
  const path = EVENT_TYPE_ICON_PATH[label] ?? EVENT_TYPE_ICON_PATH.Other;
  return (
    <span className="event-type-icon mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d={path} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const EVENT_TYPE_ICON_PATH: Record<string, string> = {
  "Birthday Party": "M12 3v18M8 7h8M7 21h10M9 3c0 2 1.5 3 3 3s3-1 3-3",
  "Corporate Event": "M4 20V8l8-4 8 4v12M9 20v-6h6v6",
  "School / Church": "M4 19h16M6 19V9l6-4 6 4v10M9 12h6",
  "Nonprofit / Community": "M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z",
  "Private Group": "M16 11a3 3 0 1 0-2-5.2M8 11a3 3 0 1 1 2-5.2M4 20a4 4 0 0 1 4-4h2M20 20a4 4 0 0 0-4-4h-2",
  "Sports Team": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  Other: "M12 4v16M8 8h8M8 16h8",
};

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
    <div className={`min-w-0 ${name === "customerGroupName" ? "sm:col-span-2" : ""}`}>
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
    { label: "Food", value: answers.foodPreference ? FOOD_PREFERENCE_LABELS[answers.foodPreference] : "", step: "food" },
    {
      label: "Private space",
      value: answers.privateSpacePreference ? PRIVATE_SPACE_PREFERENCE_LABELS[answers.privateSpacePreference] : "",
      step: "space",
    },
    { label: "Budget", value: intakeBudgetLabel(answers), step: "budget" },
    {
      label: "Event length",
      value: PUBLIC_EVENT_LENGTH_OPTIONS.find((option) => option.value === answers.desiredDurationMinutes)?.label ?? "",
      step: "length",
    },
    { label: "Preferred date and time", value: formatPreferredDateTime(answers), step: "when" },
  ];

  const contact = contactSummary(answers);

  return (
    <dl className="divide-y divide-border rounded-xl border border-border bg-surface">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <dt className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">{row.label}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{row.value || "—"}</dd>
          </div>
          <button
            type="button"
            className="shrink-0 cursor-pointer text-sm font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={() => onEdit(row.step)}
          >
            Edit {row.label}
          </button>
        </div>
      ))}
      {contact ? (
        <div className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <dt className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">Contact information</dt>
            <dd className="mt-0.5 text-sm text-foreground">{contact}</dd>
          </div>
        </div>
      ) : null}
    </dl>
  );
}
