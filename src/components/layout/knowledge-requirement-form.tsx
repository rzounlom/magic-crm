import { SecurityActionForm } from "@/components/layout/security-action-form";
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
    <div className="mt-8">
      <h2 className="text-lg font-semibold">Sales knowledge requirements</h2>
      {existing.length === 0 ? (
        <p className="mt-2 text-sm text-foreground/70">No offerings are linked yet.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {existing.map((row) => (
            <li key={row.salesKnowledgeItem.id} className="rounded-md border border-border px-3 py-2">
              <p className="font-medium">{row.salesKnowledgeItem.name}</p>
              <p className="text-foreground/70">
                {formatRequirementRule(row)}
                {row.salesKnowledgeItem.active ? "" : " · Inactive knowledge"}
              </p>
              {row.notes ? <p className="mt-1 text-foreground/60">{row.notes}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {knowledgeItems.length > 0 ? (
        <SecurityActionForm
          action={action}
          className="mt-4 space-y-3 rounded-md border border-border px-4 py-4"
          notice={{ successTitle: "Requirement saved", errorTitle: "Unable to save requirement" }}
        >
          <input type="hidden" name="resourceTypeId" value={resourceTypeId} />
          <label className="block text-sm">
            <span className="text-foreground/70">Offering</span>
            <select
              name="salesKnowledgeItemId"
              required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            >
              {knowledgeItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-foreground/70">Quantity rule</span>
            <select
              name="quantityRule"
              defaultValue={RESOURCE_QUANTITY_RULES.UNKNOWN}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            >
              <option value={RESOURCE_QUANTITY_RULES.PER_GUESTS}>1 per N guests</option>
              <option value={RESOURCE_QUANTITY_RULES.FIXED}>Fixed quantity</option>
              <option value={RESOURCE_QUANTITY_RULES.UNKNOWN}>Unknown — configuration required</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-foreground/70">Guests per unit (for 1 per N)</span>
            <input
              name="guestsPerUnit"
              type="number"
              min={1}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-foreground/70">Fixed quantity</span>
            <input
              name="quantity"
              type="number"
              min={1}
              defaultValue={1}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requiresStaffConfiguration" />
            <span>Still needs staff configuration</span>
          </label>
          <label className="block text-sm">
            <span className="text-foreground/70">Notes</span>
            <input name="notes" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
          </label>
          <PendingSubmitButton
            pendingLabel="Saving…"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Save requirement
          </PendingSubmitButton>
        </SecurityActionForm>
      ) : null}
    </div>
  );
}
