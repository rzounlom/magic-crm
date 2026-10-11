import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicStatusPanel } from "@/components/layout/public-status-panel";

describe("PublicStatusPanel", () => {
  it("presents calm public errors without internal identifiers", () => {
    const html = renderToStaticMarkup(
      <PublicStatusPanel
        title="This event plan link is unavailable"
        description="The link may be incorrect or no longer active."
        hint="Contact the venue with the email you used."
      />,
    );
    expect(html).toContain("data-public-status");
    expect(html).toContain("<h1");
    expect(html).toContain("This event plan link is unavailable");
    expect(html).toContain("Contact the venue");
    expect(html).not.toContain("organizationId");
    expect(html).not.toContain("stack");
    expect(html).not.toContain("prisma");
  });
});
