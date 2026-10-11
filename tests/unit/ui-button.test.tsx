/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, ButtonLink, buttonClassName } from "@/components/ui/button";

describe("Button", () => {
  it("renders a native button with primary styles by default", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain("Save");
    expect(html).toContain("bg-primary");
  });

  it("disables interaction while loading and exposes aria-busy", () => {
    const html = renderToStaticMarkup(
      <Button loading loadingLabel="Saving…">
        Save
      </Button>,
    );
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Saving…");
    expect(html).not.toContain(">Save<");
  });

  it("supports destructive and secondary variants", () => {
    expect(buttonClassName({ variant: "destructive" })).toContain("text-destructive");
    expect(buttonClassName({ variant: "secondary" })).toContain("border-border");
    expect(buttonClassName({ variant: "ghost" })).toContain("bg-transparent");
  });

  it("supports submit type for forms", () => {
    const html = renderToStaticMarkup(
      <Button type="submit" variant="primary">
        Submit
      </Button>,
    );
    expect(html).toContain('type="submit"');
  });

  it("ButtonLink renders an anchor with shared styles", () => {
    const html = renderToStaticMarkup(
      <ButtonLink href="/app/admin/resources/new" variant="primary">
        Add
      </ButtonLink>,
    );
    expect(html).toContain('href="/app/admin/resources/new"');
    expect(html).toContain("bg-primary");
    expect(html).toContain("Add");
  });
});
