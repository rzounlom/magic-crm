"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { createClerkUserIdentityDirectory } from "@/lib/auth/clerk-user-identity";
import { db } from "@/lib/db";
import { revalidateSecurityAdministration } from "@/server/actions/revalidate-security-administration";
import { isAuthorizationError, isTenantContextError } from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import { refreshTenantEmployeeIdentities } from "@/server/services/refresh-tenant-employee-identities";
import {
  addSecurityGroupMember,
  createSecurityGroup,
  deleteSecurityGroup,
  removeSecurityGroupMember,
  setSecurityGroupPermissions,
  updateSecurityGroup,
} from "@/server/services/security-group-service";
import type { SecurityActionResult } from "@/types/security-action";

const nameSchema = z.string().trim().min(1).max(80);
const descriptionSchema = z.string().trim().max(280).optional();
const idSchema = z.string().trim().min(1);

export type { SecurityActionResult };

function toResult(error: unknown): SecurityActionResult {
  if (isAuthorizationError(error) || isTenantContextError(error)) {
    return { ok: false, code: error.code, message: error.userMessage };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, message: "Check the form and try again." };
  }
  throw error;
}

export async function createSecurityGroupAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const parsed = z
      .object({ name: nameSchema, description: descriptionSchema })
      .parse({
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
      });
    const ctx = await getRequestContext();
    const group = await createSecurityGroup(ctx, db, parsed);
    revalidateSecurityAdministration({ groupId: group.id });
    return {
      ok: true,
      title: "Group created",
      message: `"${group.name}" is ready to assign.`,
      redirectTo: `/app/admin/security-groups/${group.id}`,
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error);
  }
}

export async function updateSecurityGroupAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const parsed = z
      .object({
        securityGroupId: idSchema,
        name: nameSchema,
        description: descriptionSchema,
      })
      .parse({
        securityGroupId: String(formData.get("securityGroupId") ?? ""),
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
      });
    const ctx = await getRequestContext();
    await updateSecurityGroup(ctx, db, parsed);
    revalidateSecurityAdministration({ groupId: parsed.securityGroupId });
    return { ok: true, title: "Group updated", message: "Group details were saved." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error);
  }
}

export async function deleteSecurityGroupAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const parsed = z.object({ securityGroupId: idSchema }).parse({
      securityGroupId: String(formData.get("securityGroupId") ?? ""),
    });
    const ctx = await getRequestContext();
    await deleteSecurityGroup(ctx, db, parsed.securityGroupId);
    revalidateSecurityAdministration({ refreshClient: false });
    return {
      ok: true,
      title: "Group deleted",
      message: "Employees were not deleted. Permissions from this group are gone.",
      redirectTo: "/app/admin/security-groups",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error);
  }
}

export async function setSecurityGroupPermissionsAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const parsed = z
      .object({
        securityGroupId: idSchema,
        permissionKeys: z.array(z.string()),
      })
      .parse({
        securityGroupId: String(formData.get("securityGroupId") ?? ""),
        permissionKeys: formData.getAll("permissionKeys").map(String),
      });
    const ctx = await getRequestContext();
    await setSecurityGroupPermissions(ctx, db, parsed);
    revalidateSecurityAdministration({ groupId: parsed.securityGroupId });
    return { ok: true, title: "Permissions updated", message: "This group's permissions were saved." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error);
  }
}

export async function addSecurityGroupMemberAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const parsed = z
      .object({ securityGroupId: idSchema, userProfileId: idSchema })
      .parse({
        securityGroupId: String(formData.get("securityGroupId") ?? ""),
        userProfileId: String(formData.get("userProfileId") ?? ""),
      });
    const ctx = await getRequestContext();
    await addSecurityGroupMember(ctx, db, parsed);
    revalidateSecurityAdministration({ groupId: parsed.securityGroupId });
    return { ok: true, title: "Member added", message: "The employee was added to this group." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error);
  }
}

export async function removeSecurityGroupMemberAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const parsed = z
      .object({ securityGroupId: idSchema, userProfileId: idSchema })
      .parse({
        securityGroupId: String(formData.get("securityGroupId") ?? ""),
        userProfileId: String(formData.get("userProfileId") ?? ""),
      });
    const ctx = await getRequestContext();
    await removeSecurityGroupMember(ctx, db, parsed);
    revalidateSecurityAdministration({ groupId: parsed.securityGroupId });
    return { ok: true, title: "Member removed", message: "The employee was removed from this group." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error);
  }
}

export async function refreshEmployeeIdentitiesAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  void formData;
  try {
    const ctx = await getRequestContext();
    const result = await refreshTenantEmployeeIdentities(ctx, db, createClerkUserIdentityDirectory());
    revalidateSecurityAdministration();
    if (result.missingCount === 0) {
      return { ok: true, title: "Employee details refreshed", message: "Employee details are already up to date." };
    }
    if (result.refreshedCount === 0) {
      return {
        ok: false,
        title: "Unable to refresh employee details",
        message: "Could not refresh employee details from Clerk. Try again.",
      };
    }
    const recordLabel = result.refreshedCount === 1 ? "employee record" : "employee records";
    return {
      ok: true,
      title: "Employee details refreshed",
      message: `Refreshed ${result.refreshedCount} ${recordLabel}.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (isAuthorizationError(error) || isTenantContextError(error) || error instanceof z.ZodError) {
      return toResult(error);
    }
    return { ok: false, title: "Unable to refresh employee details", message: "Could not refresh employee details. Try again." };
  }
}
