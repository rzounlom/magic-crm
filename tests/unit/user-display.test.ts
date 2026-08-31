import { describe, expect, it } from "vitest";

import {
  formatUserDisplayLabel,
  needsIdentitySync,
  resolveUserDisplayName,
  snapshotFromBackendClerkUser,
  snapshotFromClerkUser,
} from "@/lib/identity/user-display";

describe("formatUserDisplayLabel", () => {
  it("uses displayName and email", () => {
    expect(
      formatUserDisplayLabel({
        clerkUserId: "user_1",
        displayName: "Jane Smith",
        email: "jane@example.com",
      }),
    ).toBe("Jane Smith — jane@example.com");
  });

  it("uses first and last name with email when displayName is absent", () => {
    expect(
      formatUserDisplayLabel({
        clerkUserId: "user_1",
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
      }),
    ).toBe("Jane Smith — jane@example.com");
  });

  it("uses email only", () => {
    expect(
      formatUserDisplayLabel({
        clerkUserId: "user_1",
        email: "jane@example.com",
      }),
    ).toBe("jane@example.com");
  });

  it("uses displayName only", () => {
    expect(
      formatUserDisplayLabel({
        clerkUserId: "user_1",
        displayName: "Jane Smith",
      }),
    ).toBe("Jane Smith");
  });

  it("does not expose a Clerk id when identity is missing", () => {
    expect(formatUserDisplayLabel({ clerkUserId: "user_KxOZcBbV" })).toBe("Unknown employee");
  });
});

describe("resolveUserDisplayName", () => {
  it("prefers displayName over first and last", () => {
    expect(
      resolveUserDisplayName({
        clerkUserId: "user_1",
        displayName: "Display",
        firstName: "Jane",
        lastName: "Smith",
      }),
    ).toBe("Display");
  });
});

describe("needsIdentitySync", () => {
  it("is true only when both displayName and email are empty", () => {
    expect(needsIdentitySync({ displayName: null, email: null })).toBe(true);
    expect(needsIdentitySync({ displayName: "Jane", email: null })).toBe(false);
    expect(needsIdentitySync({ displayName: null, email: "jane@example.com" })).toBe(false);
  });
});

describe("snapshotFromClerkUser", () => {
  it("maps Clerk fields into a display snapshot", () => {
    expect(
      snapshotFromClerkUser({
        firstName: "Jane",
        lastName: "Smith",
        fullName: "Jane Smith",
        imageUrl: "https://img.example/jane.png",
        primaryEmailAddress: { emailAddress: "jane@example.com" },
      }),
    ).toEqual({
      firstName: "Jane",
      lastName: "Smith",
      displayName: "Jane Smith",
      email: "jane@example.com",
      avatarUrl: "https://img.example/jane.png",
    });
  });
});

describe("snapshotFromBackendClerkUser", () => {
  it("uses the primary email address when present", () => {
    expect(
      snapshotFromBackendClerkUser({
        firstName: "Jane",
        lastName: "Smith",
        imageUrl: "https://img.example/jane.png",
        primaryEmailAddressId: "idn_primary",
        emailAddresses: [
          { id: "idn_other", emailAddress: "other@example.com" },
          { id: "idn_primary", emailAddress: "jane@example.com" },
        ],
      }),
    ).toEqual({
      firstName: "Jane",
      lastName: "Smith",
      displayName: "Jane Smith",
      email: "jane@example.com",
      avatarUrl: "https://img.example/jane.png",
    });
  });

  it("falls back to the first email when primary is missing", () => {
    expect(
      snapshotFromBackendClerkUser({
        firstName: null,
        lastName: null,
        imageUrl: "",
        primaryEmailAddressId: null,
        emailAddresses: [{ id: "idn_1", emailAddress: "pat@example.com" }],
      }).email,
    ).toBe("pat@example.com");
  });
});
