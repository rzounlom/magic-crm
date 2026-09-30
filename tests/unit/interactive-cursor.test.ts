import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

function ruleBody(selector: string): string {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("interactive cursor", () => {
  it("gives enabled semantic controls a pointer cursor", () => {
    const body = ruleBody("button:not(:disabled)");
    expect(body).toContain("cursor: pointer");
    for (const selector of [
      "a[href]",
      "select:not(:disabled)",
      "summary",
      "[role=\"button\"]:not([aria-disabled=\"true\"])",
      "[role=\"tab\"]:not([aria-disabled=\"true\"])",
      "[role=\"menuitem\"]:not([aria-disabled=\"true\"])",
      "[type=\"checkbox\"]:not(:disabled)",
      "[type=\"radio\"]:not(:disabled)",
      "[type=\"date\"]:not(:disabled)",
      "[type=\"time\"]:not(:disabled)",
      "label:has(input[type=\"checkbox\"]:not(:disabled))",
      "label:has(input[type=\"radio\"]:not(:disabled))",
    ]) {
      expect(css).toContain(selector);
    }
    expect(css).toContain("::-webkit-calendar-picker-indicator");
  });

  it("uses not-allowed for disabled controls and does not paint the page", () => {
    const disabled = ruleBody(":disabled,");
    expect(disabled).toContain("cursor: not-allowed");
    expect(css).not.toMatch(/(^|\n)\s*\*\s*\{[^}]*cursor:\s*pointer/);
    expect(css).not.toMatch(/body\s*\{[^}]*cursor:\s*pointer/);
  });
});
