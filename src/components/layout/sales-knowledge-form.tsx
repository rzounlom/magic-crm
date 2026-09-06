import { SecurityActionForm } from "@/components/layout/security-action-form";
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
}: {
  action: (formData: FormData) => Promise<SecurityActionResult>;
  values?: KnowledgeValues;
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
      <label className="block text-sm">
        <span className="text-foreground/70">Type</span>
        <select
          name="type"
          defaultValue={values?.type ?? SALES_KNOWLEDGE_TYPES.PACKAGE}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        >
          {Object.values(SALES_KNOWLEDGE_TYPES).map((type) => (
            <option key={type} value={type}>
              {type.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Name</span>
        <input
          name="name"
          required
          maxLength={160}
          defaultValue={values?.name}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Short description</span>
        <input
          name="shortDescription"
          required
          maxLength={280}
          defaultValue={values?.shortDescription}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Details</span>
        <textarea
          name="details"
          required
          rows={5}
          maxLength={4000}
          defaultValue={values?.details}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Price text (optional)</span>
        <input
          name="priceText"
          maxLength={160}
          defaultValue={values?.priceText ?? ""}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-foreground/70">Duration (minutes)</span>
          <input
            type="number"
            name="durationMinutes"
            min={1}
            defaultValue={values?.durationMinutes ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Min guests</span>
          <input
            type="number"
            name="minGuests"
            min={0}
            defaultValue={values?.minGuests ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-foreground/70">Max guests</span>
          <input
            type="number"
            name="maxGuests"
            min={0}
            defaultValue={values?.maxGuests ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="waiverRequired" defaultChecked={values?.waiverRequired} />
        Waiver required
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" value="on" defaultChecked={values?.active !== false} />
        Active
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Customer-facing notes</span>
        <textarea
          name="customerFacingNotes"
          rows={3}
          maxLength={2000}
          defaultValue={values?.customerFacingNotes ?? ""}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Internal sales notes</span>
        <textarea
          name="salesNotes"
          rows={3}
          maxLength={2000}
          defaultValue={values?.salesNotes ?? ""}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <PendingSubmitButton
        pendingLabel="Saving…"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Save knowledge
      </PendingSubmitButton>
    </SecurityActionForm>
  );
}
