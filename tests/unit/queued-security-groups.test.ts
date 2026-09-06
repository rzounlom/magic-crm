import { describe, expect, it } from "vitest";

import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import {
  assertQueuedGroupsInTenant,
  canSelectAdministratorsGroup,
  firstAdminQueuedGroupIds,
  queuedGroupsIncludeAdministrators,
} from "@/server/team/queued-groups";

describe("queued security groups", () => {
  const orgA = "org_a";
  const frontDesk = {
    id: "g_front",
    organizationId: orgA,
    systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK,
  };
  const administrators = {
    id: "g_admin",
    organizationId: orgA,
    systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS,
  };

  it("rejects groups that are missing or belong to another tenant", () => {
    expect(() => assertQueuedGroupsInTenant([frontDesk], orgA, ["g_front"])).not.toThrow();
    expect(() => assertQueuedGroupsInTenant([frontDesk], orgA, ["g_other"])).toThrow(
      "QUEUED_GROUP_NOT_IN_TENANT",
    );
    expect(() =>
      assertQueuedGroupsInTenant(
        [{ ...frontDesk, organizationId: "org_b" }],
        orgA,
        ["g_front"],
      ),
    ).toThrow("QUEUED_GROUP_NOT_IN_TENANT");
  });

  it("allows Administrators only for a MagicCRM administrator", () => {
    expect(queuedGroupsIncludeAdministrators([frontDesk, administrators])).toBe(true);
    expect(canSelectAdministratorsGroup({ inviterIsMagicCrmAdministrator: true })).toBe(true);
    expect(canSelectAdministratorsGroup({ inviterIsMagicCrmAdministrator: false })).toBe(false);
  });

  it("always queues Administrators for first-admin intent", () => {
    expect(firstAdminQueuedGroupIds({ administratorsGroupId: "g_admin" })).toEqual(["g_admin"]);
    expect(
      firstAdminQueuedGroupIds({
        administratorsGroupId: "g_admin",
        extraGroupIds: ["g_admin", "g_front"],
      }),
    ).toEqual(["g_admin", "g_front"]);
  });
});
