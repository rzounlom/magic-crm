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
import type { SecurityActionResult } from "@/types/security-action";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 disabled:cursor-not-allowed";

export function PublicInquiryForm({
  organizationSlug,
  organizationName,
  action = submitPublicInquiryAction,
}: {
  organizationSlug: string;
  organizationName: string;
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
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      eventType: String(formData.get("eventType") ?? ""),
      occasion: String(formData.get("occasion") ?? ""),
      preferredDate: String(formData.get("preferredDate") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
      guestCount: String(formData.get("guestCount") ?? ""),
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

  return (
    <PendingActionProvider pending={pending}>
      <form className="mt-8 space-y-5" aria-busy={pending} onSubmit={onSubmit}>
        <input type="hidden" name="organizationSlug" value={organizationSlug} />
        <input type="hidden" name="submissionId" value={submissionId} />
        <div className="hidden" aria-hidden="true">
          <label htmlFor={honeypotId}>Company website</label>
          <input id={honeypotId} name="companyWebsite" tabIndex={-1} autoComplete="off" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <IntakeField
            label="First name"
            name="firstName"
            required
            maxLength={80}
            disabled={pending}
            error={fieldErrors.firstName}
            onChange={() => clearError("firstName")}
          />
          <IntakeField
            label="Last name"
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
        <IntakeField
          label="What are you planning?"
          name="eventType"
          required
          maxLength={80}
          placeholder="Birthday, corporate event, school outing…"
          disabled={pending}
          error={fieldErrors.eventType}
          onChange={() => clearError("eventType")}
        />
        <IntakeField
          label="Occasion (optional)"
          name="occasion"
          maxLength={120}
          disabled={pending}
          error={fieldErrors.occasion}
          onChange={() => clearError("occasion")}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <IntakeField
            label="Preferred date"
            name="preferredDate"
            type="date"
            disabled={pending}
            error={fieldErrors.preferredDate}
            onChange={() => clearError("preferredDate")}
          />
          <IntakeField
            label="Approximate start (optional)"
            name="startTime"
            type="time"
            disabled={pending}
            error={fieldErrors.startTime}
            onChange={() => clearError("startTime")}
          />
        </div>
        <IntakeField
          label="Guest count"
          name="guestCount"
          type="number"
          min={1}
          max={500}
          step={1}
          disabled={pending}
          error={fieldErrors.guestCount}
          onChange={() => clearError("guestCount")}
        />
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
          Start conversation
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
