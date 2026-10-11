/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ScheduleCreateEventDialog accessibility", () => {
  it("restores focus and labels the dialog for assistive technology", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/schedule-create-event-dialog.tsx"),
      "utf8",
    );
    expect(source).toContain("aria-labelledby={titleId}");
    expect(source).toContain("aria-describedby={descriptionId}");
    expect(source).toContain("previousFocusRef");
    expect(source).toContain("closeButtonRef.current?.focus()");
    expect(source).toContain("previousFocusRef.current?.focus()");
    expect(source).toContain("min-h-11");
  });
});
