/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field, FieldInput } from "@/components/ui/field";
import { bookingBadgeTone, Badge } from "@/components/ui/badge";
import { BRAND_PALETTE } from "@/lib/ui/brand-palette";

describe("Card", () => {
  it("renders default surface styling", () => {
    const html = renderToStaticMarkup(
      <Card>
        <CardTitle>Context</CardTitle>
        <CardDescription>Session details</CardDescription>
      </Card>,
    );
    expect(html).toContain("Context");
    expect(html).toContain("Session details");
    expect(html).toContain("bg-surface");
  });

  it("supports flat variant without heavy elevation class string requirements", () => {
    const html = renderToStaticMarkup(
      <Card variant="flat" padding="sm">
        Flat
      </Card>,
    );
    expect(html).toContain("Flat");
    expect(html).toContain("border-border-subtle");
  });
});

describe("Field", () => {
  it("associates label and error with the control", () => {
    const html = renderToStaticMarkup(
      <FieldInput label="Guest count" name="guestCount" error="Enter a valid guest count." required />,
    );
    expect(html).toContain("Guest count");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Enter a valid guest count.");
    expect(html).toContain("aria-describedby");
  });

  it("renders hint when there is no error", () => {
    const html = renderToStaticMarkup(
      <Field label="Notes" hint="Visible to staff only" htmlFor="notes">
        <textarea id="notes" name="notes" />
      </Field>,
    );
    expect(html).toContain('for="notes"');
    expect(html).toContain("Visible to staff only");
  });
});

describe("Badge status semantics", () => {
  it("keeps confirmed as success and pending payment as warning", () => {
    expect(bookingBadgeTone("CONFIRMED")).toBe("success");
    expect(bookingBadgeTone("PENDING_PAYMENT")).toBe("warning");
    expect(bookingBadgeTone("CANCELLED")).toBe("danger");
    const html = renderToStaticMarkup(<Badge tone="success">Confirmed</Badge>);
    expect(html).toContain("status-badge-success");
  });
});

describe("brand palette", () => {
  it("exposes Effortless Precision action and navy values for Clerk sync", () => {
    expect(BRAND_PALETTE.action).toBe("#0070E0");
    expect(BRAND_PALETTE.navy).toBe("#001C64");
    expect(BRAND_PALETTE.canvas).toBe("#F5F7FB");
    expect(BRAND_PALETTE.danger).toBe("#B42318");
  });
});
