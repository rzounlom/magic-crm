import { AdminFormSection, FormActionBar } from "@/components/layout/admin-form-chrome";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { Badge } from "@/components/ui/badge";
import { FieldInput, FieldSelect } from "@/components/ui/field";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { resourceNotesFromMetadata } from "@/server/resources/naming";
import type { SecurityActionResult } from "@/types/security-action";

export function CreateResourceForm({
  action,
  resourceTypeId,
}: {
  action: (formData: FormData) => Promise<SecurityActionResult>;
  resourceTypeId: string;
}) {
  return (
    <SecurityActionForm
      action={action}
      className="mt-4"
      notice={{ successTitle: "Resource created", errorTitle: "Unable to create resource" }}
    >
      <input type="hidden" name="resourceTypeId" value={resourceTypeId} />
      <AdminFormSection title="Add one resource">
        <FieldInput label="Name" name="name" required maxLength={120} />
        <FieldInput
          label="Capacity"
          name="capacity"
          type="number"
          min={1}
          hint="Optional. Guests this unit can serve, depending on capacity kind on bulk create."
        />
        <FormActionBar className="border-0 pt-0">
          <PendingSubmitButton pendingLabel="Adding…" variant="secondary">
            Add resource
          </PendingSubmitButton>
        </FormActionBar>
      </AdminFormSection>
    </SecurityActionForm>
  );
}

export function BulkCreateResourcesForm({
  action,
  resourceTypeId,
  typeName,
}: {
  action: (formData: FormData) => Promise<SecurityActionResult>;
  resourceTypeId: string;
  typeName: string;
}) {
  return (
    <SecurityActionForm
      action={action}
      className="mt-4"
      notice={{ successTitle: "Resources created", errorTitle: "Unable to create resources" }}
    >
      <input type="hidden" name="resourceTypeId" value={resourceTypeId} />
      <AdminFormSection
        title="Bulk create numbered resources"
        description="You choose the count. Prototype or demo numbers are not applied automatically."
      >
        <FieldInput label="Number of resources" name="count" type="number" required min={1} max={40} />
        <FieldInput
          label="Naming pattern"
          name="namePattern"
          defaultValue={`${typeName} {n}`}
          maxLength={120}
          hint="Use {n} for the sequence number."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldInput label="Capacity" name="capacity" type="number" min={1} hint="Optional." />
          <FieldSelect label="Capacity meaning" name="capacityKind" defaultValue="per_unit">
            <option value="per_unit">Guests per unit (for example a lane)</option>
            <option value="occupancy">Maximum occupancy (for example a room)</option>
          </FieldSelect>
        </div>
        <FormActionBar className="border-0 pt-0">
          <PendingSubmitButton pendingLabel="Creating…" variant="primary">
            Create resources
          </PendingSubmitButton>
        </FormActionBar>
      </AdminFormSection>
    </SecurityActionForm>
  );
}

export function ResourceRowForm({
  action,
  resource,
}: {
  action: (formData: FormData) => Promise<SecurityActionResult>;
  resource: {
    id: string;
    name: string;
    displayOrder: number;
    capacity: number | null;
    active: boolean;
    metadata: unknown;
  };
}) {
  const notes = resourceNotesFromMetadata(resource.metadata);
  const capacityKind =
    resource.metadata &&
    typeof resource.metadata === "object" &&
    !Array.isArray(resource.metadata) &&
    (resource.metadata as { capacityKind?: string }).capacityKind === "occupancy"
      ? "occupancy"
      : "per_unit";
  return (
    <SecurityActionForm
      action={action}
      className="rounded-[var(--radius-card)] border border-border bg-surface p-4"
      notice={{ successTitle: "Resource updated", errorTitle: "Unable to update resource" }}
    >
      <input type="hidden" name="id" value={resource.id} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{resource.name}</p>
        <Badge tone={resource.active ? "success" : "neutral"}>{resource.active ? "Active" : "Inactive"}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FieldInput label="Name" name="name" required defaultValue={resource.name} />
        <FieldInput label="Order" name="displayOrder" type="number" defaultValue={resource.displayOrder} />
        <FieldInput
          label="Capacity"
          name="capacity"
          type="number"
          min={1}
          defaultValue={resource.capacity ?? undefined}
        />
        <FieldSelect label="Kind" name="capacityKind" defaultValue={capacityKind}>
          <option value="per_unit">Per unit</option>
          <option value="occupancy">Occupancy</option>
        </FieldSelect>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <FieldInput label="Notes" name="notes" defaultValue={notes ?? ""} />
        <label className="flex min-h-11 items-center gap-2.5 pb-0.5 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            name="active"
            defaultChecked={resource.active}
            className="size-4 accent-primary"
          />
          Active
        </label>
      </div>
      <FormActionBar className="mt-3">
        <PendingSubmitButton pendingLabel="Saving…" variant="secondary">
          Save
        </PendingSubmitButton>
      </FormActionBar>
    </SecurityActionForm>
  );
}
