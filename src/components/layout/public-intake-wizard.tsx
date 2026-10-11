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
  PLANNER_STEP_TITLES,
  PRIVATE_SPACE_PREFERENCE_LABELS,
  PRIVATE_SPACE_PREFERENCE_VALUES,
  contactFieldErrors,
  eventGroupComplete,
  formatPreferredDateTime,
  intakeBudgetLabel,
  initialPlannerState,
  plannerAnswersToIntakeRecord,
  plannerStepError,
  preferenceGroupComplete,
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

const PLANNER_STAGES = [
  { id: "event", label: "Event" },
  { id: "experience", label: "Experience" },
  { id: "preferences", label: "Preferences" },
  { id: "when", label: "Date & Time" },
  { id: "contact", label: "Contact" },
  { id: "review", label: "Review" },
] as const;

type PlannerStage = (typeof PLANNER_STAGES)[number]["id"];

const STAGE_RANK: Record<PlannerStage, number> = {
  event: 0,
  experience: 1,
  preferences: 2,
  when: 3,
  contact: 4,
  review: 5,
};

const INPUT_CLASS =
  "mt-2 w-full min-h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3 py-3 text-base sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed";

const PRIMARY_BUTTON =
  "inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-[var(--radius-control)] bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed sm:w-auto";

const SECONDARY_BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed";

function laterStage(current: PlannerStage, next: PlannerStage): PlannerStage {
  return STAGE_RANK[next] > STAGE_RANK[current] ? next : current;
}

function deriveFurthest(
  unlocked: PlannerStage,
  ready: { groupReady: boolean; preferencesReady: boolean; whenReady: boolean },
): PlannerStage {
  let stage = unlocked;
  if (ready.groupReady) {
    stage = laterStage(stage, "experience");
  }
  if (ready.preferencesReady && STAGE_RANK[stage] >= STAGE_RANK.preferences) {
    stage = laterStage(stage, "when");
  }
  if (ready.whenReady && STAGE_RANK[stage] >= STAGE_RANK.when) {
    stage = laterStage(stage, "contact");
  }
  return stage;
}

function sectionId(stage: PlannerStage): string {
  return `planner-section-${stage}`;
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
  const revealCause = useRef<"choice" | "type">("choice");
  const previousStage = useRef<PlannerStage>("event");
  const pendingFocus = useRef<{ stage: PlannerStage; scroll?: boolean } | null>(null);
  const [state, dispatch] = useReducer(reducePlanner, undefined, initialPlannerState);
  const [unlocked, setUnlocked] = useState<PlannerStage>("event");
  const [reviewing, setReviewing] = useState(false);
  const [showError, setShowError] = useState(false);
  const [attractionError, setAttractionError] = useState(false);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const [pending, setPending] = useState(false);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [focusTick, setFocusTick] = useState(0);
  const attractionNames = useMemo(
    () => new Map(attractions.map((item) => [item.id, item.name])),
    [attractions],
  );
  const answers = state.answers;
  const groupReady = eventGroupComplete(answers);
  const preferencesReady = preferenceGroupComplete(answers);
  const whenReady = plannerStepError("when", answers) == null;
  const contactReady = plannerStepError("contact", answers) == null;
  const startTime = to24HourTime(answers.startHour, answers.startMinute, answers.startPeriod) ?? "";
  const furthest = deriveFurthest(unlocked, { groupReady, preferencesReady, whenReady });
  const currentStage: PlannerStage = reviewing ? "review" : furthest;

  function requestPlannerFocus(stage: PlannerStage, options?: { scroll?: boolean }) {
    pendingFocus.current = { stage, scroll: options?.scroll };
    setFocusTick((tick) => tick + 1);
  }

  useEffect(() => {
    if (previousStage.current === furthest) {
      return;
    }
    const next = furthest;
    previousStage.current = next;
    if (revealCause.current === "type" || isTypingField(document.activeElement)) {
      return;
    }
    const node = document.getElementById(sectionId(next));
    node?.scrollIntoView?.({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "nearest",
    });
  }, [furthest]);

  // Focus after commit so review (and remounted edit sections) exist in the DOM.
  useEffect(() => {
    const request = pendingFocus.current;
    if (!request) {
      return;
    }
    pendingFocus.current = null;
    focusPlannerSection(request.stage, { scroll: request.scroll });
  }, [focusTick, reviewing]);

  function edit(patch: Partial<PlannerAnswers>, cause: "choice" | "type" = "choice") {
    revealCause.current = cause;
    setShowError(false);
    dispatch({ type: "edit", patch });
  }

  function confirmReset() {
    revealCause.current = "choice";
    dispatch({ type: "startOver" });
    setUnlocked("event");
    setReviewing(false);
    setSubmissionId(crypto.randomUUID());
    setContactErrors({});
    setShowError(false);
    setConfirmStartOver(false);
    previousStage.current = "event";
  }

  function mixRequiresAttraction(mix: string) {
    return (attractionRequiredGuestMixes as readonly string[]).includes(mix);
  }

  function attractionSelectionRequired() {
    return mixRequiresAttraction(answers.guestMix) && answers.attractionInterestIds.length === 0;
  }

  function openReview() {
    if (attractionSelectionRequired()) {
      setAttractionError(true);
      setReviewing(false);
      requestPlannerFocus("experience");
      return;
    }
    const fields = contactFieldErrors(answers);
    if (!contactReady || !whenReady || !preferencesReady || !groupReady) {
      setContactErrors(fields);
      setShowError(true);
      return;
    }
    setContactErrors({});
    setReviewing(true);
    revealCause.current = "choice";
    requestPlannerFocus("review");
  }

  function editSection(step: PlannerStep) {
    setReviewing(false);
    requestPlannerFocus(stageForStep(step), { scroll: true });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onSafeSubmitAttempt(pendingRef.current) === "block") {
      return;
    }
    if (attractionSelectionRequired()) {
      setAttractionError(true);
      setReviewing(false);
      return;
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
      setReviewing(false);
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
        const contactKeys = ["firstName", "lastName", "email", "phone", "customerGroupName", "notes"];
        if (contactKeys.some((key) => result.fieldErrors?.[key])) {
          setReviewing(false);
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

  const showExperience = STAGE_RANK[furthest] >= STAGE_RANK.experience;
  const showPreferences = STAGE_RANK[furthest] >= STAGE_RANK.preferences;
  const showWhen = STAGE_RANK[furthest] >= STAGE_RANK.when;
  const showContact = STAGE_RANK[furthest] >= STAGE_RANK.contact;

  return (
    <>
      <PendingActionProvider pending={pending}>
        <div data-planner-shell aria-busy={pending} inert={pending ? true : undefined} className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <PlannerProgress current={currentStage} />
            <button
              type="button"
              className={`${SECONDARY_BUTTON} shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 sm:min-h-10`}
              onClick={() => setConfirmStartOver(true)}
              disabled={pending}
            >
              Start over
            </button>
          </div>

          <div data-planner-scroll className="public-scroll min-h-0 flex-1 overflow-y-auto pt-5 pr-2 pb-8">
            <form id="planner-review" aria-busy={pending} onSubmit={onSubmit}>
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

              {reviewing ? (
                <section id={sectionId("review")} tabIndex={-1} className="outline-none">
                  <SectionHeading title="Review your event" />
                  <ReviewList answers={answers} attractionNames={attractionNames} onEdit={editSection} />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Building these options does not book your event or hold a time.
                  </p>
                  <div className="planner-stage-actions flex justify-end">
                    <PendingSubmitButton form="planner-review" pendingLabel={PUBLIC_INQUIRY_PENDING_COPY} className={PRIMARY_BUTTON}>
                      Build my event options
                    </PendingSubmitButton>
                  </div>
                </section>
              ) : (
                <>
                  <section id={sectionId("event")} tabIndex={-1} className="planner-section outline-none">
                    <SectionHeading title="Your event" />
                    <ChoiceGroup legend={PLANNER_STEP_TITLES.event}>
                      {publicEventTypeOptions().map((option) => (
                        <ChoiceCard
                          key={option}
                          label={option}
                          selected={answers.eventType === option}
                          onClick={() => edit({ eventType: option })}
                        />
                      ))}
                    </ChoiceGroup>
                    {answers.eventType ? (
                      <div className="mt-8 grid gap-6">
                        <label className="block max-w-xs text-sm font-medium text-foreground" htmlFor="guest-count">
                          Guest count
                          <input
                            id="guest-count"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={3}
                            value={answers.guestCount}
                            aria-invalid={showError && Boolean(plannerStepError("guests", answers))}
                            className={INPUT_CLASS}
                            onChange={(event) =>
                              edit({ guestCount: event.target.value.replace(/\D/g, "").slice(0, 3) }, "type")
                            }
                          />
                        </label>
                        {showError && plannerStepError("guests", answers) ? (
                          <p role="alert" className="text-sm text-destructive">
                            {plannerStepError("guests", answers)}
                          </p>
                        ) : null}
                        <div>
                          <h3 className="text-base font-semibold text-foreground">{PLANNER_STEP_TITLES.mix}</h3>
                          <div className="mt-3">
                            <ChoiceGroup legend={PLANNER_STEP_TITLES.mix}>
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
                    {showError && !answers.eventType ? (
                      <p role="alert" className="mt-4 text-sm text-destructive">
                        Choose an event type.
                      </p>
                    ) : null}
                  </section>

                  {showExperience ? (
                    <section id={sectionId("experience")} tabIndex={-1} className="planner-section outline-none">
                      <SectionHeading
                        title="Experience"
                        detail={
                          mixRequiresAttraction(answers.guestMix)
                            ? "Choose at least one attraction for this group. Your selections stay on every option."
                            : "Choose anything your group is interested in. We'll use your preferences, group size, and availability to build the best options. You can continue without selecting any."
                        }
                      />
                      <ChoiceGroup legend={PLANNER_STEP_TITLES.attractions}>
                        {attractions.length === 0 ? (
                          <p className="text-sm text-muted-foreground sm:col-span-2">
                            This venue has not listed specific activities here. Continue and we&apos;ll recommend from its usual
                            options.
                          </p>
                        ) : (
                          attractions.map((item) => (
                            <ChoiceCard
                              key={item.id}
                              label={formatCustomerDurationText(item.name)}
                              description={item.description}
                              selected={answers.attractionInterestIds.includes(item.id)}
                              onClick={() => {
                                revealCause.current = "choice";
                                setAttractionError(false);
                                dispatch({ type: "toggleAttraction", id: item.id });
                              }}
                            />
                          ))
                        )}
                      </ChoiceGroup>
                      {attractionError ? (
                        <p role="alert" className="mt-4 text-sm text-destructive">
                          Choose at least one attraction.
                        </p>
                      ) : null}
                      {STAGE_RANK[furthest] < STAGE_RANK.preferences ? (
                        <div className="planner-stage-actions flex justify-end">
                          <button
                            type="button"
                            className={PRIMARY_BUTTON}
                            onClick={() => {
                              if (attractionSelectionRequired()) {
                                setAttractionError(true);
                                return;
                              }
                              setAttractionError(false);
                              revealCause.current = "choice";
                              setUnlocked((current) => laterStage(current, "preferences"));
                            }}
                          >
                            Continue
                          </button>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {showPreferences ? (
                    <section id={sectionId("preferences")} tabIndex={-1} className="planner-section outline-none">
                      <SectionHeading title="Event preferences" />
                      <PreferenceBlock title={PLANNER_STEP_TITLES.food}>
                        <ChoiceGroup legend="Food">
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
                      <PreferenceBlock title={PLANNER_STEP_TITLES.space}>
                        <ChoiceGroup legend="Private space">
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
                        title={PLANNER_STEP_TITLES.budget}
                        detail="This is a total for the event, and it only guides recommendations. It is not a quote or a maximum price."
                      >
                        <ChoiceGroup legend="Budget">
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
                        title={PLANNER_STEP_TITLES.length}
                        detail="This is how long you'd like to be here. We'll use it as a preference when we build options. It is not a guaranteed schedule."
                      >
                        <ChoiceGroup legend="Event length">
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

                  {showWhen ? (
                    <section id={sectionId("when")} tabIndex={-1} className="planner-section outline-none">
                      <SectionHeading
                        title="Date and time"
                        detail="This is a preferred start time. If that time is unavailable, we can look at nearby times."
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
                        <fieldset className="min-w-0">
                          <legend className="text-sm font-medium text-foreground">Preferred start time</legend>
                          <div className="time-group mt-2 grid grid-cols-3 overflow-hidden rounded-xl border border-border">
                            <TimeSelect
                              id="start-hour"
                              label="Hour"
                              value={answers.startHour}
                              onChange={(startHour) => edit({ startHour })}
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
                              onChange={(startMinute) => edit({ startMinute })}
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
                              onChange={(startPeriod) => edit({ startPeriod: startPeriod as "AM" | "PM" | "" })}
                            >
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </TimeSelect>
                          </div>
                        </fieldset>
                      </div>
                      {showError && plannerStepError("when", answers) ? (
                        <p role="alert" className="mt-3 text-sm text-destructive">
                          {plannerStepError("when", answers)}
                        </p>
                      ) : null}
                    </section>
                  ) : null}

                  {showContact ? (
                    <section id={sectionId("contact")} tabIndex={-1} className="planner-section outline-none">
                      <SectionHeading title="How can we reach you?" detail="We'll use this to send your event options." />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <ContactField
                          label="First name"
                          name="firstName"
                          value={answers.firstName}
                          autoComplete="given-name"
                          disabled={pending}
                          error={contactErrors.firstName}
                          onChange={(value) => edit({ firstName: value }, "type")}
                        />
                        <ContactField
                          label="Last name"
                          name="lastName"
                          value={answers.lastName}
                          autoComplete="family-name"
                          disabled={pending}
                          error={contactErrors.lastName}
                          onChange={(value) => edit({ lastName: value }, "type")}
                        />
                        <ContactField
                          label="Email"
                          name="email"
                          type="email"
                          value={answers.email}
                          autoComplete="email"
                          disabled={pending}
                          error={contactErrors.email}
                          onChange={(value) => edit({ email: value }, "type")}
                        />
                        <ContactField
                          label="Phone (optional)"
                          name="phone"
                          type="tel"
                          value={answers.phone}
                          autoComplete="tel"
                          disabled={pending}
                          error={contactErrors.phone}
                          onChange={(value) => edit({ phone: formatUsPhoneInput(value) }, "type")}
                        />
                        <ContactField
                          label="Group or company name (optional)"
                          name="customerGroupName"
                          value={answers.customerGroupName}
                          disabled={pending}
                          error={contactErrors.customerGroupName}
                          onChange={(value) => edit({ customerGroupName: value }, "type")}
                        />
                        <label className="block text-sm font-medium text-foreground sm:col-span-2">
                          Notes (optional)
                          <textarea
                            name="notes"
                            value={answers.notes}
                            disabled={pending}
                            rows={3}
                            className={INPUT_CLASS}
                            onChange={(event) => edit({ notes: event.target.value }, "type")}
                          />
                        </label>
                      </div>
                      <div className="planner-stage-actions flex justify-end">
                        <button type="button" className={PRIMARY_BUTTON} onClick={openReview}>
                          Review your event
                        </button>
                      </div>
                    </section>
                  ) : null}
                </>
              )}
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

function stageForStep(step: PlannerStep): PlannerStage {
  if (step === "event" || step === "guests" || step === "mix") {
    return "event";
  }
  if (step === "attractions") {
    return "experience";
  }
  if (step === "food" || step === "space" || step === "budget" || step === "length") {
    return "preferences";
  }
  if (step === "when") {
    return "when";
  }
  if (step === "contact") {
    return "contact";
  }
  return "review";
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isTypingField(node: Element | null): boolean {
  return node instanceof HTMLInputElement && node.type !== "date" && node.type !== "checkbox" && node.type !== "radio";
}

/** Synchronous focus — callers must run after the target section is committed. */
function focusPlannerSection(stage: PlannerStage, options?: { scroll?: boolean }) {
  const node = document.getElementById(sectionId(stage));
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

function PlannerProgress({ current }: { current: PlannerStage }) {
  return (
    <ol
      data-planner-progress
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2"
      aria-label="Planner progress"
    >
      {PLANNER_STAGES.map((stage) => {
        const active = stage.id === current;
        const done = STAGE_RANK[stage.id] < STAGE_RANK[current];
        return (
          <li
            key={stage.id}
            aria-current={active ? "step" : undefined}
            className={`rounded-full px-2.5 py-1 text-[0.65rem] font-bold tracking-[0.08em] uppercase sm:text-xs ${
              active
                ? "bg-primary/10 text-primary"
                : done
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground"
            }`}
          >
            {stage.label}
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
    <div className="mt-6 first:mt-0">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ChoiceGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset data-choice-grid className="choice-grid">
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
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={accessibleName}
      className="choice-card flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] px-4 py-3.5 text-left"
      onClick={onClick}
    >
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{label}</span>
        {description ? <span className="mt-1 block text-sm text-muted-foreground">{description}</span> : null}
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
    <label className="block min-w-0 border-r border-border px-2 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase last:border-r-0" htmlFor={id}>
      {label}
      <select id={id} value={value} className="w-full cursor-pointer text-sm font-medium text-foreground normal-case" onChange={(event) => onChange(event.target.value)}>
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
      ? answers.attractionInterestIds.map((id) => formatCustomerDurationText(attractionNames.get(id) ?? "Selected activity")).join(", ")
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
    { label: "Contact information", value: contactSummary(answers), step: "contact" },
  ];

  return (
    <dl className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-4 px-4 py-3">
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{row.label}</dt>
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
