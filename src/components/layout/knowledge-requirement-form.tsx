import { AdminFormSection, AdminSectionHeader, FormActionBar } from "@/components/layout/admin-form-chrome";
import { SecurityActionForm } from "@/components/layout/security-action-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FieldInput, FieldSelect } from "@/components/ui/field";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatRequirementRule } from "@/server/resources/plan-availability-status";
import type { SecurityActionResult } from "@/types/security-action";
import { RESOURCE_QUANTITY_RULES } from "@/types/resource-schedule";

export function KnowledgeRequirementForm({
  action,
  resourceTypeId,
  knowledgeItems,
  existing,
}: {
  action: (formData: FormData) => Promise<SecurityActionResult>;
  resourceTypeId: string;
  knowledgeItems: Array<{ id: string; name: string; type: string }>;
  existing: Array<{
    salesKnowledgeItem: { id: string; name: string; active: boolean };
    quantityRule: string;
    quantity: number | null;
    guestsPerUnit: number | null;
    requiresStaffConfiguration: boolean;
    notes: string | null;
  }>;
}) {
  return (
    <div className="mt-10 space-y-4">
      <AdminSectionHeader
        title="Sales knowledge requirements"
        description="Link offerings that need this resource type for availability checks."
      />
      {existing.length === 0 ? (
        <p className="text-sm text-muted-foreground">No offerings are linked yet.</p>
      ) : (
        <ul className="space-y-2">
          {existing.map((row) => (
            <li key={row.salesKnowledgeItem.id}>
              <Card variant="flat" padding="sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-foreground">{row.salesKnowledgeItem.name}</p>
                  {!row.salesKnowledgeItem.active ? <Badge tone="neutral">Inactive knowledge</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{formatRequirementRule(row)}</p>
                {row.notes ? <p className="mt-1 text-sm text-muted-foreground">{row.notes}</p> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {knowledgeItems.length > 0 ? (
        <SecurityActionForm
          action={action}
          notice={{ successTitle: "Requirement saved", errorTitle: "Unable to save requirement" }}
        >
          <input type="hidden" name="resourceTypeId" value={resourceTypeId} />
          <AdminFormSection title="Add or update requirement">
            <FieldSelect label="Offering" name="salesKnowledgeItemId" required>
              {knowledgeItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </FieldSelect>
            <FieldSelect
              label="Quantity rule"
              name="quantityRule"
              defaultValue={RESOURCE_QUANTITY_RULES.UNKNOWN}
            >
              <option value={RESOURCE_QUANTITY_RULES.PER_GUESTS}>1 per N guests</option>
              <option value={RESOURCE_QUANTITY_RULES.FIXED}>Fixed quantity</option>
              <option value={RESOURCE_QUANTITY_RULES.UNKNOWN}>Unknown — configuration required</option>
            </FieldSelect>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldInput
                label="Guests per unit"
                name="guestsPerUnit"
                type="number"
                min={1}
                hint="For the 1 per N guests rule."
              />
              <FieldInput label="Fixed quantity" name="quantity" type="number" min={1} defaultValue={1} />
            </div>
            <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium text-foreground">
              <input type="checkbox" name="requiresStaffConfiguration" className="size-4 accent-primary" />
              Still needs staff configuration
            </label>
            <FieldInput label="Notes" name="notes" />
            <FormActionBar className="border-0 pt-0">
              <PendingSubmitButton pendingLabel="Saving…" variant="primary">
                Save requirement
              </PendingSubmitButton>
            </FormActionBar>
          </AdminFormSection>
        </SecurityActionForm>
      ) : null}
    </div>
  );
}
