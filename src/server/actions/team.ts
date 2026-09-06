"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { createClerkOrganizationDirectory } from "@/lib/auth/clerk-organization-directory";
import { db } from "@/lib/db";
import { revalidateTeamAdministration } from "@/server/actions/revalidate-team-administration";
import {
  isAuthorizationError,
  isTeamManagementError,
  isTenantContextError,
} from "@/server/errors";
import { getRequestContext } from "@/server/get-request-context";
import {
  inviteEmployee,
  revokeTeamInvitation,
  sendNewTeamInvitation,
} from "@/server/services/team-invitation-service";
import {
  addSecurityGroupMember,
  removeSecurityGroupMember,
} from "@/server/services/security-group-service";
import type { SecurityActionResult } from "@/types/security-action";

const emailSchema = z.string().trim().min(1).max(254);
const idSchema = z.string().trim().min(1);

function teamErrorTitle(code: string | undefined, fallback: string): string {
  switch (code) {
    case "ALREADY_ORGANIZATION_MEMBER":
      return "Already a team member";
    case "INVITATION_ALREADY_PENDING":
      return "Invitation already pending";
    case "CLERK_REVOKE_FAILED":
      return "Unable to revoke invitation";
    case "CLERK_INVITATION_FAILED":
    case "CLERK_UNAVAILABLE":
      return fallback;
    default:
      return fallback;
  }
}

function toResult(error: unknown, fallbackTitle: string): SecurityActionResult {
  if (isAuthorizationError(error) || isTenantContextError(error) || isTeamManagementError(error)) {
    return {
      ok: false,
      code: error.code,
      title: teamErrorTitle(error.code, fallbackTitle),
      message: error.userMessage,
    };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, title: fallbackTitle, message: "Check the form and try again." };
  }
  throw error;
}

export async function inviteEmployeeAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const parsed = z
      .object({
        email: emailSchema,
        securityGroupIds: z.array(z.string()),
      })
      .parse({
        email: String(formData.get("email") ?? ""),
        securityGroupIds: formData.getAll("securityGroupIds").map(String),
      });
    const ctx = await getRequestContext();
    const directory = await createClerkOrganizationDirectory();
    await inviteEmployee(ctx, db, directory, parsed);
    revalidateTeamAdministration();
    return {
      ok: true,
      title: "Invitation sent",
      message: `An invitation was sent to ${parsed.email.trim()}.`,
      redirectTo: "/app/admin/team/invitations",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to send invitation");
  }
}

export async function revokeTeamInvitationAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const parsed = z.object({ invitationId: idSchema }).parse({
      invitationId: String(formData.get("invitationId") ?? ""),
    });
    const ctx = await getRequestContext();
    const directory = await createClerkOrganizationDirectory();
    const result = await revokeTeamInvitation(ctx, db, directory, parsed.invitationId);
    revalidateTeamAdministration();
    if (result.outcome === "reconciled") {
      return {
        ok: true,
        title: "Invitation no longer active",
        message: "MagicCRM updated the invitation status.",
      };
    }
    return {
      ok: true,
      title: "Invitation revoked",
      message: "The invitation is no longer active.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to revoke invitation");
  }
}

export async function sendNewTeamInvitationAction(formData: FormData): Promise<SecurityActionResult> {
  try {
    const parsed = z.object({ invitationId: idSchema }).parse({
      invitationId: String(formData.get("invitationId") ?? ""),
    });
    const ctx = await getRequestContext();
    const directory = await createClerkOrganizationDirectory();
    await sendNewTeamInvitation(ctx, db, directory, parsed.invitationId);
    revalidateTeamAdministration();
    return {
      ok: true,
      title: "New invitation sent",
      message: "The previous invitation is no longer usable.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to send invitation");
  }
}

export async function addEmployeeSecurityGroupAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const parsed = z
      .object({ securityGroupId: idSchema, userProfileId: idSchema })
      .parse({
        securityGroupId: String(formData.get("securityGroupId") ?? ""),
        userProfileId: String(formData.get("userProfileId") ?? ""),
      });
    const ctx = await getRequestContext();
    await addSecurityGroupMember(ctx, db, parsed);
    revalidateTeamAdministration({ userProfileId: parsed.userProfileId });
    return { ok: true, title: "Group added", message: "The employee was added to this security group." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to add group");
  }
}

export async function removeEmployeeSecurityGroupAction(
  formData: FormData,
): Promise<SecurityActionResult> {
  try {
    const parsed = z
      .object({ securityGroupId: idSchema, userProfileId: idSchema })
      .parse({
        securityGroupId: String(formData.get("securityGroupId") ?? ""),
        userProfileId: String(formData.get("userProfileId") ?? ""),
      });
    const ctx = await getRequestContext();
    await removeSecurityGroupMember(ctx, db, parsed);
    revalidateTeamAdministration({ userProfileId: parsed.userProfileId });
    return { ok: true, title: "Group removed", message: "The employee was removed from this security group." };
  } catch (error) {
    unstable_rethrow(error);
    return toResult(error, "Unable to remove group");
  }
}
