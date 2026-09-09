"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  isAuthorizationError,
  isResourceError,
  isTenantContextError,
} from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { revalidateResourceAdministration } from "@/server/actions/revalidate-resources";
import {
  bulkCreateResources,
  createResource,
  createResourceType,
  updateResource,
  updateResourceType,
  upsertKnowledgeResourceRequirement,
} from "@/server/services/resource-admin-service";
import { RESOURCE_QUANTITY_RULES, RESOURCE_SCHEDULING_MODES } from "@/types/resource-schedule";
import type { SecurityActionResult } from "@/types/security-action";

function toResult(error: unknown, title: string): SecurityActionResult {
  if (isAuthorizationError(error) || isTenantContextError(error) || isResourceError(error)) {
    return { ok: false, code: error.code, title, message: error.userMessage };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, title, message: "Check the form and try again." };
  }
  throw error;
}

function optionalInt(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  if (!text) {
    return undefined;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function createResourceTypeAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const ctx = await getRequestContext();
    const created = await createResourceType(ctx, db, {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? "") || undefined,
      schedulingMode: String(formData.get("schedulingMode") ?? RESOURCE_SCHEDULING_MODES.SLOTTED),
      slotMinutes: optionalInt(formData.get("slotMinutes")),
      defaultDurationMinutes: optionalInt(formData.get("defaultDurationMinutes")) ?? null,
    });
    await revalidateResourceAdministration();
    return {
      ok: true,
      title: "Resource type created",
      message: "Add numbered resources next so availability can be validated.",
      redirectTo: `/app/admin/resources/${created.id}`,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to create resource type");
  }
}

export async function updateResourceTypeAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const id = z.string().trim().min(1).parse(String(formData.get("id") ?? ""));
    const ctx = await getRequestContext();
    await updateResourceType(ctx, db, id, {
      name: String(formData.get("name") ?? ""),
      schedulingMode: String(formData.get("schedulingMode") ?? RESOURCE_SCHEDULING_MODES.SLOTTED),
      slotMinutes: optionalInt(formData.get("slotMinutes")),
      defaultDurationMinutes: optionalInt(formData.get("defaultDurationMinutes")) ?? null,
      active: String(formData.get("active") ?? "") === "on",
    });
    await revalidateResourceAdministration();
    return { ok: true, title: "Resource type updated", message: "Inventory settings were saved." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to update resource type");
  }
}

export async function createResourceAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const ctx = await getRequestContext();
    await createResource(ctx, db, {
      resourceTypeId: String(formData.get("resourceTypeId") ?? ""),
      name: String(formData.get("name") ?? ""),
      displayOrder: optionalInt(formData.get("displayOrder")),
      capacity: optionalInt(formData.get("capacity")) ?? null,
      capacityKind: String(formData.get("capacityKind") ?? "") === "occupancy" ? "occupancy" : "per_unit",
      notes: String(formData.get("notes") ?? "") || null,
    });
    await revalidateResourceAdministration();
    return { ok: true, title: "Resource created", message: "It will appear on the Master Schedule." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to create resource");
  }
}

export async function bulkCreateResourcesAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const ctx = await getRequestContext();
    const count = await bulkCreateResources(ctx, db, {
      resourceTypeId: String(formData.get("resourceTypeId") ?? ""),
      count: optionalInt(formData.get("count")) ?? 0,
      namePattern: String(formData.get("namePattern") ?? ""),
      capacity: optionalInt(formData.get("capacity")) ?? null,
      capacityKind: String(formData.get("capacityKind") ?? "") === "occupancy" ? "occupancy" : "per_unit",
    });
    await revalidateResourceAdministration();
    return {
      ok: true,
      title: "Resources created",
      message: `${count} resources were added. Counts are tenant data, not application defaults.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to create resources");
  }
}

export async function updateResourceAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const id = z.string().trim().min(1).parse(String(formData.get("id") ?? ""));
    const ctx = await getRequestContext();
    await updateResource(ctx, db, id, {
      name: String(formData.get("name") ?? ""),
      displayOrder: optionalInt(formData.get("displayOrder")),
      capacity: optionalInt(formData.get("capacity")) ?? null,
      capacityKind: String(formData.get("capacityKind") ?? "") === "occupancy" ? "occupancy" : "per_unit",
      notes: String(formData.get("notes") ?? "") || null,
      active: String(formData.get("active") ?? "") === "on",
    });
    await revalidateResourceAdministration();
    return { ok: true, title: "Resource updated", message: "Inventory was saved." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to update resource");
  }
}

export async function upsertKnowledgeRequirementAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const ctx = await getRequestContext();
    const quantityRule = String(formData.get("quantityRule") ?? RESOURCE_QUANTITY_RULES.UNKNOWN);
    await upsertKnowledgeResourceRequirement(ctx, db, {
      salesKnowledgeItemId: String(formData.get("salesKnowledgeItemId") ?? ""),
      resourceTypeId: String(formData.get("resourceTypeId") ?? ""),
      quantityRule,
      quantity: optionalInt(formData.get("quantity")) ?? null,
      guestsPerUnit: optionalInt(formData.get("guestsPerUnit")) ?? null,
      durationMinutes: optionalInt(formData.get("durationMinutes")) ?? null,
      requiresStaffConfiguration: String(formData.get("requiresStaffConfiguration") ?? "") === "on",
      notes: String(formData.get("notes") ?? "") || null,
    });
    await revalidateResourceAdministration();
    return { ok: true, title: "Requirement saved", message: "Recommendations will use this resource rule." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to save requirement");
  }
}
