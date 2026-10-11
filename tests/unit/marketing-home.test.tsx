/** @vitest-environment jsdom */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { MarketingHome } from "@/components/marketing/marketing-home";
import { ProductShowcase } from "@/components/marketing/product-showcase";
import { marketingMetadata } from "@/lib/marketing/metadata";

afterEach(() => {
  cleanup();
});

describe("marketing homepage", () => {
  it("ships authentic marketing screenshot assets", () => {
    const assets = [
      "intake-desktop-event.png",
      "intake-desktop-fun.png",
      "intake-desktop-when.png",
      "intake-mobile-event.png",
      "og-card.png",
    ];
    for (const name of assets) {
      const filePath = path.join(process.cwd(), "public/marketing", name);
      expect(existsSync(filePath), filePath).toBe(true);
      expect(readFileSync(filePath).byteLength).toBeGreaterThan(10_000);
    }
  });

  it("renders one H1, on-page CTAs, and employee sign-in", () => {
    render(<MarketingHome />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/extraordinary/i);
    expect(screen.getAllByRole("link", { name: "Employee sign in" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Explore the platform" }).length).toBeGreaterThan(0);
    const copy = document.body.textContent ?? "";
    expect(copy).toMatch(/does not claim point-of-sale systems/i);
    expect(copy).not.toMatch(/testimonial/i);
    expect(copy).not.toMatch(/\$\d+M/);
    expect(copy).not.toMatch(/\d+% (increase|growth|conversion)/i);
    expect(screen.getByText(/HOLD is not a confirmed booking/i)).toBeTruthy();
  });

  it("switches showcase tabs without inventing staff screenshots", async () => {
    const user = userEvent.setup();
    render(<ProductShowcase />);
    await user.click(screen.getByRole("tab", { name: "Staff workspace" }));
    expect(screen.getByText(/PLAYWRIGHT_STORAGE_STATE/i)).toBeTruthy();
    expect(screen.queryByAltText(/staff dashboard/i)).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Customer intake" }));
    expect(screen.getByAltText(/event-type selection/i)).toBeTruthy();
  });

  it("exports truthful metadata without a speculative production domain", () => {
    const previous = process.env.APP_URL;
    delete process.env.APP_URL;
    const meta = marketingMetadata();
    expect(meta.title).toMatch(/MagicCRM/);
    expect(meta.description).toMatch(/inquiry/i);
    expect(meta.alternates?.canonical).toBeUndefined();
    expect(meta.openGraph?.images).toBeTruthy();
    if (previous === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = previous;
    }
  });
});
