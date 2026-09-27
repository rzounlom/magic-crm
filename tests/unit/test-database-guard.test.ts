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
});
