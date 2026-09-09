import { SecurityActionForm } from "@/components/layout/security-action-form";
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
      className="mt-4 space-y-3 rounded-md border border-border px-4 py-4"
      notice={{ successTitle: "Resource created", errorTitle: "Unable to create resource" }}
    >
      <input type="hidden" name="resourceTypeId" value={resourceTypeId} />
      <p className="text-sm font-medium">Add one resource</p>
      <label className="block text-sm">
        <span className="text-foreground/70">Name</span>
        <input name="name" required maxLength={120} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Capacity (optional)</span>
        <input name="capacity" type="number" min={1} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
      </label>
      <PendingSubmitButton
        pendingLabel="Adding…"
        className="rounded-md border border-border px-4 py-2 text-sm font-medium"
      >
        Add resource
      </PendingSubmitButton>
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
      className="mt-4 space-y-3 rounded-md border border-border px-4 py-4"
      notice={{ successTitle: "Resources created", errorTitle: "Unable to create resources" }}
    >
      <input type="hidden" name="resourceTypeId" value={resourceTypeId} />
      <p className="text-sm font-medium">Bulk create numbered resources</p>
      <p className="text-xs text-foreground/60">
        You choose the count. Prototype or demo numbers are not applied automatically.
      </p>
      <label className="block text-sm">
        <span className="text-foreground/70">Number of resources</span>
        <input
          name="count"
          type="number"
          required
          min={1}
          max={40}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Naming pattern</span>
        <input
          name="namePattern"
          defaultValue={`${typeName} {n}`}
          maxLength={120}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Capacity (optional)</span>
        <input
          name="capacity"
          type="number"
          min={1}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Capacity meaning</span>
        <select name="capacityKind" defaultValue="per_unit" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
          <option value="per_unit">Guests per unit (for example a lane)</option>
          <option value="occupancy">Maximum occupancy (for example a room)</option>
        </select>
      </label>
      <PendingSubmitButton
        pendingLabel="Creating…"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Create resources
      </PendingSubmitButton>
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
      className="grid gap-2 rounded-md border border-border px-3 py-3 text-sm sm:grid-cols-6 sm:items-end"
      notice={{ successTitle: "Resource updated", errorTitle: "Unable to update resource" }}
    >
      <input type="hidden" name="id" value={resource.id} />
      <label className="sm:col-span-2">
        <span className="text-foreground/70">Name</span>
        <input
          name="name"
          required
          defaultValue={resource.name}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
        />
      </label>
      <label>
        <span className="text-foreground/70">Order</span>
        <input
          name="displayOrder"
          type="number"
          defaultValue={resource.displayOrder}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
        />
      </label>
      <label>
        <span className="text-foreground/70">Capacity</span>
        <input
          name="capacity"
          type="number"
          min={1}
          defaultValue={resource.capacity ?? undefined}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
        />
      </label>
      <label>
        <span className="text-foreground/70">Kind</span>
        <select name="capacityKind" defaultValue={capacityKind} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5">
          <option value="per_unit">Per unit</option>
          <option value="occupancy">Occupancy</option>
        </select>
      </label>
      <label className="flex items-center gap-2 pb-1">
        <input type="checkbox" name="active" defaultChecked={resource.active} />
        <span>Active</span>
      </label>
      <label className="sm:col-span-4">
        <span className="text-foreground/70">Notes</span>
        <input
          name="notes"
          defaultValue={notes ?? ""}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
        />
      </label>
      <PendingSubmitButton
        pendingLabel="Saving…"
        className="rounded-md border border-border px-3 py-2 text-sm font-medium sm:col-span-2"
      >
        Save
      </PendingSubmitButton>
    </SecurityActionForm>
  );
}
