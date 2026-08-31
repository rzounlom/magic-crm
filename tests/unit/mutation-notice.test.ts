import { describe, expect, it } from "vitest";

import { mutationNotice } from "@/lib/ui/mutation-notice";

const addMemberCopy = {
  successTitle: "Member added",
  successDescription: "Theresa was added to Administrators.",
  errorTitle: "Unable to add member",
};

describe("mutationNotice", () => {
  it("maps a successful security mutation to a success notification", () => {
    expect(mutationNotice({ ok: true, title: "Member added" }, addMemberCopy)).toEqual({
      tone: "success",
      title: "Member added",
      description: "Theresa was added to Administrators.",
      refresh: true,
      redirectTo: undefined,
    });
  });

  it("keeps a redirect target for create and delete", () => {
    expect(
      mutationNotice(
        {
          ok: true,
          title: "Group created",
          message: '"Event Supervisors" is ready to assign.',
          redirectTo: "/app/admin/security-groups/grp_1",
        },
        { successTitle: "Group created", errorTitle: "Unable to create group" },
      ),
    ).toMatchObject({
      tone: "success",
      title: "Group created",
      description: '"Event Supervisors" is ready to assign.',
      redirectTo: "/app/admin/security-groups/grp_1",
    });
  });

  it("maps a failed mutation to an error notification without refresh", () => {
    expect(
      mutationNotice({ ok: false, message: "The change was not saved." }, addMemberCopy),
    ).toEqual({
      tone: "error",
      title: "Unable to add member",
      description: "The change was not saved.",
      refresh: false,
    });
  });

  it("maps last-admin rejection to a clear error toast", () => {
    expect(
      mutationNotice(
        {
          ok: false,
          code: "LAST_ADMIN_REQUIRED",
          message: "At least one administrator must remain.",
        },
        { successTitle: "Member removed", errorTitle: "Unable to remove member" },
      ),
    ).toEqual({
      tone: "error",
      title: "Unable to remove member",
      description: "At least one administrator must remain.",
      refresh: false,
    });
  });
});
