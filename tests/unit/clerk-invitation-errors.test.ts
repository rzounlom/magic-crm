import { describe, expect, it } from "vitest";

import { TeamManagementError } from "@/server/errors";
import {
  classifyClerkInvitationError,
  mapClerkInvitationError,
  readClerkErrorCodes,
} from "@/server/team/clerk-invitation-errors";

describe("Clerk invitation error mapping", () => {
  it("reads Clerk error codes without exposing raw messages to callers", () => {
    expect(
      readClerkErrorCodes({
        clerkError: true,
        errors: [{ code: "duplicate_record", message: "internal" }],
      }),
    ).toEqual(["duplicate_record"]);
  });

  it("classifies invitation-not-found and not-pending from Clerk codes", () => {
    expect(
      classifyClerkInvitationError({
        status: 404,
        errors: [{ code: "resource_not_found" }],
      }).classification,
    ).toBe("INVITATION_NOT_FOUND");

    expect(
      classifyClerkInvitationError({
        status: 404,
        errors: [{ code: "organization_invitation_not_pending", message: "not pending" }],
      }).classification,
    ).toBe("INVITATION_NOT_PENDING");
  });

  it("classifies accepted, revoked, duplicate, member, and unavailable failures", () => {
    expect(
      classifyClerkInvitationError({
        status: 400,
        errors: [{ code: "invitation_already_accepted" }],
      }).classification,
    ).toBe("INVITATION_ALREADY_ACCEPTED");

    expect(
      classifyClerkInvitationError({
        status: 400,
        errors: [{ code: "invitation_already_revoked" }],
      }).classification,
    ).toBe("INVITATION_ALREADY_REVOKED");

    expect(
      classifyClerkInvitationError({
        status: 400,
        errors: [{ code: "organization_invitation_not_unique" }],
      }).classification,
    ).toBe("INVITATION_ALREADY_PENDING");

    expect(
      classifyClerkInvitationError({
        errors: [{ code: "already_a_member_in_organization" }],
      }).classification,
    ).toBe("ALREADY_ORGANIZATION_MEMBER");

    expect(
      classifyClerkInvitationError({
        status: 500,
        errors: [{ code: "internal_clerk_error" }],
      }).classification,
    ).toBe("CLERK_UNAVAILABLE");
  });

  it("maps already-a-member and duplicate invites to friendly codes", () => {
    expect(
      mapClerkInvitationError({
        errors: [{ code: "already_a_member_in_organization" }],
      }),
    ).toMatchObject({ code: "ALREADY_ORGANIZATION_MEMBER" });

    expect(
      mapClerkInvitationError({
        errors: [{ code: "duplicate_record", longMessage: "already been invited" }],
      }),
    ).toMatchObject({ code: "INVITATION_ALREADY_PENDING" });
  });

  it("uses an operation-specific fallback for unexpected Clerk failures", () => {
    const send = mapClerkInvitationError({ status: 500, errors: [{ code: "internal" }] }, "send");
    expect(send).toBeInstanceOf(TeamManagementError);
    expect(send.code).toBe("CLERK_UNAVAILABLE");
    expect(send.userMessage).not.toContain("internal");

    const revoke = mapClerkInvitationError({ status: 418, errors: [{ code: "weird" }] }, "revoke");
    expect(revoke.code).toBe("CLERK_REVOKE_FAILED");
    expect(revoke.userMessage).toMatch(/revoked/i);
    expect(revoke.userMessage).not.toMatch(/send/i);
  });
});
