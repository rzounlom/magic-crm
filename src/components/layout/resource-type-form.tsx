import { SecurityActionForm } from "@/components/layout/security-action-form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { SecurityActionResult } from "@/types/security-action";
import { RESOURCE_SCHEDULING_MODES } from "@/types/resource-schedule";

type ResourceTypeValues = {
  id?: string;
  name: string;
  slug?: string;
  schedulingMode: string;
  slotMinutes: number;
  defaultDurationMinutes: number | null;
  active: boolean;
};

export function ResourceTypeForm({
  action,
  values,
}: {
  action: (formData: FormData) => Promise<SecurityActionResult>;
  values?: ResourceTypeValues;
}) {
  return (
    <SecurityActionForm
      action={action}
      className="mt-8 space-y-5"
      notice={{
        successTitle: values ? "Resource type updated" : "Resource type created",
        errorTitle: "Unable to save resource type",
      }}
    >
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <label className="block text-sm">
        <span className="text-foreground/70">Name</span>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={values?.name}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      {values?.slug ? (
        <p className="text-sm text-foreground/60">Slug: {values.slug}</p>
      ) : (
        <label className="block text-sm">
          <span className="text-foreground/70">Slug (optional)</span>
          <input
            name="slug"
            maxLength={80}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            placeholder="bowling-lane"
          />
        </label>
      )}
      <label className="block text-sm">
        <span className="text-foreground/70">Scheduling mode</span>
        <select
          name="schedulingMode"
          defaultValue={values?.schedulingMode ?? RESOURCE_SCHEDULING_MODES.SLOTTED}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        >
          <option value={RESOURCE_SCHEDULING_MODES.SLOTTED}>Slotted (30-minute grid)</option>
          <option value={RESOURCE_SCHEDULING_MODES.CONTINUOUS}>Continuous</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Slot minutes</span>
        <input
          name="slotMinutes"
          type="number"
          min={5}
          defaultValue={values?.slotMinutes ?? 30}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Default duration (minutes)</span>
        <input
          name="defaultDurationMinutes"
          type="number"
          min={1}
          defaultValue={values?.defaultDurationMinutes ?? undefined}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      {values ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={values.active} />
          <span>Active</span>
        </label>
      ) : null}
      <PendingSubmitButton
        pendingLabel="Saving…"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {values ? "Save resource type" : "Create resource type"}
      </PendingSubmitButton>
    </SecurityActionForm>
  );
}
