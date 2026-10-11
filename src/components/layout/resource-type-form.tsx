import { AdminFormSection, FormActionBar } from "@/components/layout/admin-form-chrome";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { FieldInput, FieldSelect } from "@/components/ui/field";
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
      <AdminFormSection
        title="Resource type"
        description="A category such as Bowling Lane or Party Room. Numbered inventory is configured separately."
      >
        <FieldInput
          label="Name"
          name="name"
          required
          maxLength={120}
          defaultValue={values?.name}
        />
        {values?.slug ? (
          <p className="text-sm text-muted-foreground">
            Slug: <span className="font-medium text-foreground">{values.slug}</span>
          </p>
        ) : (
          <FieldInput
            label="Slug"
            name="slug"
            maxLength={80}
            placeholder="bowling-lane"
            hint="Optional. Used in configuration references."
          />
        )}
        <FieldSelect
          label="Scheduling mode"
          name="schedulingMode"
          defaultValue={values?.schedulingMode ?? RESOURCE_SCHEDULING_MODES.SLOTTED}
        >
          <option value={RESOURCE_SCHEDULING_MODES.SLOTTED}>Slotted (30-minute grid)</option>
          <option value={RESOURCE_SCHEDULING_MODES.CONTINUOUS}>Continuous</option>
        </FieldSelect>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldInput
            label="Slot minutes"
            name="slotMinutes"
            type="number"
            min={5}
            defaultValue={values?.slotMinutes ?? 30}
          />
          <FieldInput
            label="Default duration (minutes)"
            name="defaultDurationMinutes"
            type="number"
            min={1}
            defaultValue={values?.defaultDurationMinutes ?? undefined}
          />
        </div>
        {values ? (
          <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              name="active"
              defaultChecked={values.active}
              className="size-4 accent-primary"
            />
            Active
          </label>
        ) : null}
      </AdminFormSection>
      <FormActionBar>
        <PendingSubmitButton pendingLabel="Saving…" variant="primary">
          {values ? "Save resource type" : "Create resource type"}
        </PendingSubmitButton>
      </FormActionBar>
    </SecurityActionForm>
  );
}
