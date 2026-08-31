import { describe, expect, it } from "vitest";

import { readClerkMiddlewareKeys } from "@/lib/auth/clerk-keys";

describe("readClerkMiddlewareKeys", () => {
  it("is not configured when Clerk keys are missing", () => {
    expect(readClerkMiddlewareKeys({})).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
      configured: false,
    });
  });

  it("is configured only when both keys are present", () => {
    expect(
      readClerkMiddlewareKeys({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
        CLERK_SECRET_KEY: "sk_test_example",
      }),
    ).toMatchObject({ configured: true });
  });
});
