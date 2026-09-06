import { describe, expect, it } from "vitest";

import { TeamManagementError } from "@/server/errors";
import { validateCreateClientTenantInput } from "@/server/team/create-client-tenant-input";

describe("createClientTenant input", () => {
  it("accepts a named organization, admin email, timezone, and currency", () => {
    expect(
      validateCreateClientTenantInput({
        organizationName: "  Riverside Fun Center ",
        adminEmail: "Owner@Riverside.test",
        timezone: "America/New_York",
        currency: "usd",
      }),
    ).toEqual({
      organizationName: "Riverside Fun Center",
      adminEmail: "Owner@Riverside.test",
      emailNormalized: "owner@riverside.test",
      timezone: "America/New_York",
      currency: "USD",
    });
  });

  it("rejects a short name, invalid email, timezone, or currency", () => {
    expect(() =>
      validateCreateClientTenantInput({ organizationName: "A", adminEmail: "a@b.co" }),
    ).toThrow(TeamManagementError);
    expect(() =>
      validateCreateClientTenantInput({
        organizationName: "Riverside",
        adminEmail: "not-an-email",
      }),
    ).toThrow(TeamManagementError);
    expect(() =>
      validateCreateClientTenantInput({
        organizationName: "Riverside",
        adminEmail: "a@b.co",
        timezone: "Not/A_Zone",
      }),
    ).toThrow(TeamManagementError);
    expect(() =>
      validateCreateClientTenantInput({
        organizationName: "Riverside",
        adminEmail: "a@b.co",
        currency: "US",
      }),
    ).toThrow(TeamManagementError);
  });
});
