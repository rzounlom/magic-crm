import { AdminFormSection, FormActionBar } from "@/components/layout/admin-form-chrome";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { FieldInput, FieldSelect, FieldTextarea } from "@/components/ui/field";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { SecurityActionResult } from "@/types/security-action";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";

type KnowledgeValues = {
  id?: string;
  type: string;
  name: string;
  shortDescription: string;
  details: string;
  priceText: string | null;
  durationMinutes: number | null;
  minGuests: number | null;
  maxGuests: number | null;
  waiverRequired: boolean;
  active: boolean;
  salesNotes: string | null;
  customerFacingNotes: string | null;
};

export function SalesKnowledgeForm({
  action,
  values,
  readOnly = false,
}: {
  action: (formData: FormData) => Promise<SecurityActionResult>;
  values?: KnowledgeValues;
  /** Presentation of existing AI_MANAGE gate — fields remain visible, mutations hidden. */
  readOnly?: boolean;
}) {
  return (
    <SecurityActionForm
      action={action}
      className="mt-8 space-y-5"
      notice={{
        successTitle: values ? "Knowledge updated" : "Knowledge saved",
        errorTitle: "Unable to save knowledge",
      }}
    >
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <AdminFormSection
        title="Offering"
        description="Facts the Event Assistant may use. Do not invent availability or unpublished prices."
      >
        <FieldSelect
          label="Type"
          name="type"
          defaultValue={values?.type ?? SALES_KNOWLEDGE_TYPES.PACKAGE}
          disabled={readOnly}
        >
          {Object.values(SALES_KNOWLEDGE_TYPES).map((type) => (
            <option key={type} value={type}>
              {type.replaceAll("_", " ")}
            </option>
          ))}
        </FieldSelect>
        <FieldInput
          label="Name"
          name="name"
          required
          maxLength={160}
          defaultValue={values?.name}
          disabled={readOnly}
        />
        <FieldInput
          label="Short description"
          name="shortDescription"
          required
          maxLength={280}
          defaultValue={values?.shortDescription}
          disabled={readOnly}
        />
        <FieldTextarea
          label="Details"
          name="details"
          required
          rows={5}
          maxLength={4000}
          defaultValue={values?.details}
          disabled={readOnly}
        />
      </AdminFormSection>

      <AdminFormSection
        title="Pricing & capacity"
        description="Price text is descriptive only. Tax is not collected here."
      >
        <FieldInput
          label="Price text"
          name="priceText"
          maxLength={160}
          defaultValue={values?.priceText ?? ""}
          disabled={readOnly}
          hint="Optional customer-facing price wording (not a checkout total)."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldInput
            label="Duration (minutes)"
            type="number"
            name="durationMinutes"
            min={1}
            defaultValue={values?.durationMinutes ?? ""}
            disabled={readOnly}
          />
          <FieldInput
            label="Min guests"
            type="number"
            name="minGuests"
            min={0}
            defaultValue={values?.minGuests ?? ""}
            disabled={readOnly}
          />
          <FieldInput
            label="Max guests"
            type="number"
            name="maxGuests"
            min={0}
            defaultValue={values?.maxGuests ?? ""}
            disabled={readOnly}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            name="waiverRequired"
            defaultChecked={values?.waiverRequired}
            disabled={readOnly}
            className="size-4 accent-primary"
          />
          Waiver required
        </label>
        <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            name="active"
            value="on"
            defaultChecked={values?.active !== false}
            disabled={readOnly}
            className="size-4 accent-primary"
          />
          Active
        </label>
      </AdminFormSection>

      <AdminFormSection title="Notes">
        <FieldTextarea
          label="Customer-facing notes"
          name="customerFacingNotes"
          rows={3}
          maxLength={2000}
          defaultValue={values?.customerFacingNotes ?? ""}
          disabled={readOnly}
        />
        <FieldTextarea
          label="Internal sales notes"
          name="salesNotes"
          rows={3}
          maxLength={2000}
          defaultValue={values?.salesNotes ?? ""}
          disabled={readOnly}
        />
      </AdminFormSection>

      {readOnly ? (
        <p className="text-sm text-muted-foreground" role="status">
          You can view this offering. Saving requires manage permission.
        </p>
      ) : (
        <FormActionBar>
          <PendingSubmitButton pendingLabel="Saving…" variant="primary">
            Save knowledge
          </PendingSubmitButton>
        </FormActionBar>
      )}
    </SecurityActionForm>
  );
}
