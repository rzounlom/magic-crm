import { describe, expect, it } from "vitest";
import {
  hasPendingInvitationForEmail,
  isValidInvitationEmail,
  normalizeInvitationEmail,
} from "@/server/team/invitation-email";
import { TEAM_INVITATION_STATUSES } from "@/types/team";

describe("invitation email", () => {
  it("normalizes lookup email without using it as authorization", () => {
    expect(normalizeInvitationEmail("  Alex@Example.COM ")).toBe("alex@example.com");
  });

  it("rejects empty, oversized, and malformed emails", () => {
    expect(isValidInvitationEmail("")).toBe(false);
    expect(isValidInvitationEmail("not-an-email")).toBe(false);
    expect(isValidInvitationEmail(`${"a".repeat(250)}@x.com`)).toBe(false);
    expect(isValidInvitationEmail("person@fun-center.com")).toBe(true);
  });

  it("detects a duplicate pending invitation in one organization", () => {
    expect(
      hasPendingInvitationForEmail(
        [
          { emailNormalized: "a@example.com", status: TEAM_INVITATION_STATUSES.REVOKED },
          { emailNormalized: "a@example.com", status: TEAM_INVITATION_STATUSES.PENDING },
        ],
        "a@example.com",
      ),
    ).toBe(true);
    expect(
      hasPendingInvitationForEmail(
        [{ emailNormalized: "a@example.com", status: TEAM_INVITATION_STATUSES.ACCEPTED }],
        "a@example.com",
      ),
    ).toBe(false);
  });
});
