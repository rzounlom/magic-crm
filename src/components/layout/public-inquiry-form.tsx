"use client";

import { useRouter } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import {
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import { PendingActionProvider, PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  PUBLIC_INQUIRY_PENDING_COPY,
  PublicInquiryPendingBanner,
} from "@/components/layout/public-inquiry-pending";
import { formatUsPhoneInput } from "@/lib/inquiries/public-phone";
import { onSafeSubmitAttempt } from "@/lib/ui/confirm-gate";
import { notify } from "@/lib/ui/notify";
import { yieldToPaint } from "@/lib/ui/yield-to-paint";
import { submitPublicInquiryAction } from "@/server/actions/public-inquiry";
import { readPublicIntakeFields } from "@/server/inquiries/intake-validation";
import {
  BUDGET_BAND_LABELS,
  BUDGET_BAND_VALUES,
  DINING_PREFERENCE_LABELS,
  DINING_PREFERENCE_VALUES,
  EVENT_DURATION_LABELS,
  EVENT_DURATION_MINUTES,
  EVENT_GOAL_OPTIONS,
  EVENT_TYPE_OPTIONS,
  GUEST_MIX_LABELS,
  GUEST_MIX_VALUES,
  SPACE_PREFERENCE_LABELS,
  SPACE_PREFERENCE_VALUES,
} from "@/types/event-planner";
import type { SecurityActionResult } from "@/types/security-action";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 disabled:cursor-not-allowed";

export type PublicPlannerCatalogOption = { id: string; name: string };

export function PublicInquiryForm({
  organizationSlug,
  organizationName,
  attractions = [],
  diningOptions = [],
  action = submitPublicInquiryAction,
}: {
  organizationSlug: string;
  organizationName: string;
  attractions?: PublicPlannerCatalogOption[];
  diningOptions?: PublicPlannerCatalogOption[];
  action?: (formData: FormData) => Promise<SecurityActionResult>;
}) {
  const router = useRouter();
  const submissionId = useMemo(() => crypto.randomUUID(), []);
  const honeypotId = useId();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function clearError(name: string) {
    setFieldErrors((current) => {
      if (!current[name]) {
        return current;
      }
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onSafeSubmitAttempt(pendingRef.current) === "block") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const clientCheck = readPublicIntakeFields({
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      customerGroupName: String(formData.get("customerGroupName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      eventType: String(formData.get("eventType") ?? ""),
      preferredDate: String(formData.get("preferredDate") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
      guestCount: String(formData.get("guestCount") ?? ""),
      guestMix: String(formData.get("guestMix") ?? ""),
      desiredDurationMinutes: String(formData.get("desiredDurationMinutes") ?? ""),
      budgetBand: String(formData.get("budgetBand") ?? ""),
      eventGoal: String(formData.get("eventGoal") ?? ""),
      diningPreference: String(formData.get("diningPreference") ?? ""),
      spacePreference: String(formData.get("spacePreference") ?? ""),
      attractionInterestIds: formData.getAll("attractionInterestIds").map(String),
      notes: String(formData.get("notes") ?? ""),
      companyWebsite: String(formData.get("companyWebsite") ?? ""),
      submissionId: String(formData.get("submissionId") ?? ""),
    });
    if (!clientCheck.success) {
      setFieldErrors(clientCheck.fieldErrors);
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setFieldErrors({});
    await yieldToPaint();

    let keepPending = false;
    try {
      const result = await action(formData);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
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

  const diningChoices =
    diningOptions.length > 0
      ? [
          ...diningOptions.map((item) => ({ value: item.id, label: item.name })),
          { value: "not_sure", label: DINING_PREFERENCE_LABELS.not_sure },
          { value: "none", label: DINING_PREFERENCE_LABELS.none },
        ]
      : DINING_PREFERENCE_VALUES.map((value) => ({
          value,
          label: DINING_PREFERENCE_LABELS[value],
        }));

  return (
    <PendingActionProvider pending={pending}>
      <form className="mt-8 space-y-5" aria-busy={pending} onSubmit={onSubmit}>
        <input type="hidden" name="organizationSlug" value={organizationSlug} />
        <input type="hidden" name="submissionId" value={submissionId} />
        <div className="hidden" aria-hidden="true">
          <label htmlFor={honeypotId}>Company website</label>
          <input id={honeypotId} name="companyWebsite" tabIndex={-1} autoComplete="off" />
        </div>

        <IntakeField
          label="Customer / group name (optional)"
          name="customerGroupName"
          maxLength={160}
          disabled={pending}
          error={fieldErrors.customerGroupName}
          onChange={() => clearError("customerGroupName")}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <IntakeField
            label="Contact first name"
            name="firstName"
            required
            maxLength={80}
            disabled={pending}
            error={fieldErrors.firstName}
            onChange={() => clearError("firstName")}
          />
          <IntakeField
            label="Contact last name"
            name="lastName"
            required
            maxLength={80}
            disabled={pending}
            error={fieldErrors.lastName}
            onChange={() => clearError("lastName")}
          />
        </div>
        <IntakeField
          label="Email"
          name="email"
          type="email"
          required
          maxLength={254}
          disabled={pending}
          error={fieldErrors.email}
          onChange={() => clearError("email")}
        />
        <IntakeField
          label="Phone (optional)"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          disabled={pending}
          value={phone}
          error={fieldErrors.phone}
          onChange={(event) => {
            setPhone(formatUsPhoneInput(event.target.value));
            clearError("phone");
          }}
        />
        <IntakeSelect
          label="Customer / event type"
          name="eventType"
          required
          disabled={pending}
          error={fieldErrors.eventType}
          onChange={() => clearError("eventType")}
        >
          <option value="">Choose an event type</option>
          {EVENT_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </IntakeSelect>
        <div className="grid gap-5 sm:grid-cols-2">
          <IntakeField
            label="Requested event date"
            name="preferredDate"
            type="date"
            required
            disabled={pending}
            error={fieldErrors.preferredDate}
            onChange={() => clearError("preferredDate")}
          />
          <IntakeField
            label="Preferred start time (optional)"
            name="startTime"
            type="time"
            disabled={pending}
            error={fieldErrors.startTime}
            onChange={() => clearError("startTime")}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <IntakeField
            label="Estimated guest count"
            name="guestCount"
            type="number"
            required
            min={1}
            max={500}
            step={1}
            disabled={pending}
            error={fieldErrors.guestCount}
            onChange={() => clearError("guestCount")}
          />
          <IntakeSelect
            label="Guest mix"
            name="guestMix"
            required
            disabled={pending}
            error={fieldErrors.guestMix}
            onChange={() => clearError("guestMix")}
          >
            <option value="">Choose a guest mix</option>
            {GUEST_MIX_VALUES.map((value) => (
              <option key={value} value={value}>
                {GUEST_MIX_LABELS[value]}
              </option>
            ))}
          </IntakeSelect>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <IntakeSelect
            label="Desired event length"
            name="desiredDurationMinutes"
            required
            disabled={pending}
            error={fieldErrors.desiredDurationMinutes}
            onChange={() => clearError("desiredDurationMinutes")}
          >
            <option value="">Choose a length</option>
            {EVENT_DURATION_MINUTES.map((value) => (
              <option key={value} value={value}>
                {EVENT_DURATION_LABELS[value]}
              </option>
            ))}
          </IntakeSelect>
          <IntakeSelect
            label="Approximate budget"
            name="budgetBand"
            required
            disabled={pending}
            error={fieldErrors.budgetBand}
            onChange={() => clearError("budgetBand")}
          >
            <option value="">Choose a budget</option>
            {BUDGET_BAND_VALUES.map((value) => (
              <option key={value} value={value}>
                {BUDGET_BAND_LABELS[value]}
              </option>
            ))}
          </IntakeSelect>
        </div>
        <IntakeSelect
          label="Main event goal"
          name="eventGoal"
          required
          disabled={pending}
          error={fieldErrors.eventGoal}
          onChange={() => clearError("eventGoal")}
        >
          <option value="">Choose a goal</option>
          {EVENT_GOAL_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </IntakeSelect>
        <IntakeSelect
          label="Dining preference"
          name="diningPreference"
          required
          disabled={pending}
          error={fieldErrors.diningPreference}
          onChange={() => clearError("diningPreference")}
        >
          <option value="">Choose a dining preference</option>
          {diningChoices.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </IntakeSelect>
        <IntakeSelect
          label="Space preference"
          name="spacePreference"
          required
          disabled={pending}
          error={fieldErrors.spacePreference}
          onChange={() => clearError("spacePreference")}
        >
          <option value="">Choose a space preference</option>
          {SPACE_PREFERENCE_VALUES.map((value) => (
            <option key={value} value={value}>
              {SPACE_PREFERENCE_LABELS[value]}
            </option>
          ))}
        </IntakeSelect>
        {attractions.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-sm text-foreground/70">Attractions of interest (optional)</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {attractions.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="attractionInterestIds"
                    value={item.id}
                    disabled={pending}
                    onChange={() => clearError("attractionInterestIds")}
                  />
                  <span>{item.name}</span>
                </label>
              ))}
            </div>
            <FieldError id="attractionInterestIds-error" message={fieldErrors.attractionInterestIds} />
          </fieldset>
        ) : null}
        <label className="block text-sm">
          <span className="text-foreground/70">Anything else we should know?</span>
          <textarea
            name="notes"
            rows={4}
            maxLength={2000}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.notes)}
            aria-describedby={fieldErrors.notes ? "notes-error" : undefined}
            onChange={() => clearError("notes")}
            className={FIELD_CLASS}
          />
          <FieldError id="notes-error" message={fieldErrors.notes} />
        </label>
        <PendingSubmitButton
          pendingLabel={PUBLIC_INQUIRY_PENDING_COPY}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Create my event plan
        </PendingSubmitButton>
        {pending ? <PublicInquiryPendingBanner /> : null}
        <p className="sr-only">Submitting for {organizationName}</p>
      </form>
    </PendingActionProvider>
  );
}

function IntakeField({
  label,
  name,
  error,
  onChange,
  ...input
}: {
  label: string;
  name: string;
  error?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "className">) {
  const errorId = `${name}-error`;
  return (
    <label className="block text-sm">
      <span className="text-foreground/70">{label}</span>
      <input
        {...input}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={onChange}
        className={FIELD_CLASS}
      />
      <FieldError id={errorId} message={error} />
    </label>
  );
}

function IntakeSelect({
  label,
  name,
  error,
  children,
  onChange,
  ...select
}: {
  label: string;
  name: string;
  error?: string;
  children: ReactNode;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "name" | "className">) {
  const errorId = `${name}-error`;
  return (
    <label className="block text-sm">
      <span className="text-foreground/70">{label}</span>
      <select
        {...select}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={onChange}
        className={FIELD_CLASS}
      >
        {children}
      </select>
      <FieldError id={errorId} message={error} />
    </label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-foreground">
      {message}
    </p>
  );
}
