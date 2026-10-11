import { describe, expect, it } from "vitest";

import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { assertTestDatabaseClient } from "../helpers/test-database";

describe("test database cleanup guard", () => {
  it("refuses a database client that was not opened from the test URL", () => {
    expect(() => assertTestDatabaseClient({})).toThrow(/Cleanup refused/);
  });

  it("does not delete when the client is not the integration-test client", async () => {
    await expect(deleteTestOrganizations({} as never, ["org_should_not_be_used"])).rejects.toThrow(/Cleanup refused/);
  });

  it("refuses organization ids that fail the SQL safety check", async () => {
    const fakeClient = Object.create(null) as object;
    Object.defineProperty(fakeClient, Symbol.for("magiccrm.testDatabaseClient"), { value: true });
    // Bypass assertTestDatabaseClient host checks by stubbing load path — still refuse unsafe ids
    // when a marked client is present but ids are not cuid/uuid-shaped.
    await expect(
      deleteTestOrganizations(fakeClient as never, ["'; DROP TABLE organizations; --"]),
    ).rejects.toThrow(/Cleanup refused/);
  });
});
