import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  onConfirmDialogChoice,
  onDestructiveSubmitAttempt,
  onSafeSubmitAttempt,
} from "@/lib/ui/confirm-gate";
import {
  deleteSecurityGroupConfirm,
  removeSecurityMemberConfirm,
} from "@/lib/ui/destructive-confirm";

describe("confirm gate", () => {
  it("requires confirmation before a destructive submit", () => {
    expect(onDestructiveSubmitAttempt(false)).toBe("open-dialog");
  });

  it("does not submit when confirmation is cancelled", () => {
    expect(onConfirmDialogChoice(false, "cancel")).toBe("abort");
  });

  it("runs the mutation after confirmation", () => {
    expect(onConfirmDialogChoice(false, "confirm")).toBe("run");
  });

  it("blocks a second submit while an action is pending", () => {
    expect(onSafeSubmitAttempt(true)).toBe("block");
    expect(onDestructiveSubmitAttempt(true)).toBe("block");
    expect(onConfirmDialogChoice(true, "confirm")).toBe("block");
  });

  it("does not use a browser-native confirm dialog", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/security-action-form.tsx"),
      "utf8",
    );
    expect(source).not.toContain("window.confirm");
    expect(source).toContain("ConfirmDialog");
    expect(source).toContain("@/lib/ui/notify");
    expect(source).not.toContain('from "sonner"');
  });
});

describe("destructive confirm copy", () => {
  it("requires stronger copy when removing an administrator", () => {
    const copy = removeSecurityMemberConfirm({
      isAdministrators: true,
      memberLabel: "rzonulm@gmail.com",
      groupName: "Administrators",
    });
    expect(copy.title).toBe("Remove administrator?");
    expect(copy.description).toContain("rzonulm@gmail.com");
    expect(copy.warning).toContain("revoke administrative access");
    expect(copy.confirmLabel).toBe("Remove member");
  });

  it("explains access loss when removing a normal member", () => {
    const copy = removeSecurityMemberConfirm({
      isAdministrators: false,
      memberLabel: "pat@example.com",
      groupName: "Front Desk",
    });
    expect(copy.title).toBe("Remove member?");
    expect(copy.description).toBe("Remove pat@example.com from Front Desk?");
    expect(copy.warning).toContain("lose access");
  });

  it("requires confirmation that names the custom group and preserves employees", () => {
    const copy = deleteSecurityGroupConfirm("Event Supervisors");
    expect(copy.title).toBe('Delete "Event Supervisors"?');
    expect(copy.description).toContain("remain in MagicCRM");
    expect(copy.warning).toContain("Employees themselves will not be deleted");
    expect(copy.confirmLabel).toBe("Delete group");
  });
});
