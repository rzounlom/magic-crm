import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, refresh } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath,
  refresh,
}));

import { revalidateSecurityAdministration } from "@/server/actions/revalidate-security-administration";

describe("revalidateSecurityAdministration", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    refresh.mockClear();
  });

  it("revalidates the employee shell and security group paths after a mutation", () => {
    revalidateSecurityAdministration({ groupId: "grp_1" });

    expect(revalidatePath).toHaveBeenCalledWith("/app", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/app/admin/security-groups");
    expect(revalidatePath).toHaveBeenCalledWith("/app/admin/security-groups/new");
    expect(revalidatePath).toHaveBeenCalledWith("/app/admin/security-groups/grp_1");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("can skip the client refresh when the action redirects", () => {
    revalidateSecurityAdministration({ refreshClient: false });

    expect(revalidatePath).toHaveBeenCalledWith("/app", "layout");
    expect(refresh).not.toHaveBeenCalled();
  });
});
