import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

describe("ConfirmDialog", () => {
  it("renders accessible title, description, cancel, and confirm actions", () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open
        title="Remove member?"
        description="Remove pat@example.com from Front Desk?"
        warning="They may immediately lose access granted by this group."
        confirmLabel="Remove member"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(html).toContain("Remove member?");
    expect(html).toContain("Remove pat@example.com from Front Desk?");
    expect(html).toContain("Cancel");
    expect(html).toContain("Remove member");
    expect(html.indexOf("Cancel")).toBeLessThan(html.lastIndexOf("Remove member"));
    expect(html).toContain("aria-labelledby");
    expect(html).toContain("aria-describedby");
    expect(html).toContain("left-1/2");
    expect(html).toContain("top-1/2");
    expect(html).toContain("-translate-x-1/2");
    expect(html).toContain("-translate-y-1/2");
  });
});
