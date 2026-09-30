/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useTransition: () => [true, (fn: () => void) => fn()] as const,
  };
});

import { ScheduleDayNav } from "@/components/layout/schedule-day-nav";

describe("schedule day navigation pending", () => {
  it("disables day controls and Go while navigation is pending", () => {
    const html = renderToStaticMarkup(
      <ScheduleDayNav
        date="2026-09-17"
        prev="2026-09-16"
        next="2026-09-18"
        today="2026-09-17"
        focus="all"
      />,
    );

    expect(html).toContain("disabled");
    expect(html).toContain("Loading schedule…");
    expect(html).toContain("Loading…");
    expect(html.match(/disabled/g)?.length).toBeGreaterThan(3);
  });
});
