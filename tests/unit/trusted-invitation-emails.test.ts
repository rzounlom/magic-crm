import { describe, expect, it } from "vitest";

import { verifiedEmailsFromClerkUser } from "@/server/team/trusted-invitation-emails";

describe("trusted invitation emails", () => {
  it("uses primary and verified Clerk emails, not unverified aliases", () => {
    expect(
      verifiedEmailsFromClerkUser({
        primaryEmailAddress: { emailAddress: "Primary@Example.com" },
        emailAddresses: [
          { emailAddress: "Primary@Example.com", verification: { status: "verified" } },
          { emailAddress: "alias@example.com", verification: { status: "verified" } },
          { emailAddress: "untrusted@example.com", verification: { status: "unverified" } },
        ],
      }),
    ).toEqual(["primary@example.com", "alias@example.com"]);
  });

  it("does not invent emails when Clerk identity is missing", () => {
    expect(verifiedEmailsFromClerkUser({ emailAddresses: [] })).toEqual([]);
  });
});
