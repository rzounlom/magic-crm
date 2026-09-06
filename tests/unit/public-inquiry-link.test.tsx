import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicInquiryLink } from "@/components/layout/public-inquiry-link";

describe("PublicInquiryLink", () => {
  it("opens the current tenant public inquiry route in a new tab", () => {
    const tenantA = renderToStaticMarkup(<PublicInquiryLink href="/inquire/fun-center-a" />);
    const tenantB = renderToStaticMarkup(<PublicInquiryLink href="/inquire/fun-center-b" />);

    expect(tenantA).toContain('href="/inquire/fun-center-a"');
    expect(tenantB).toContain('href="/inquire/fun-center-b"');
    expect(tenantA).not.toContain("/inquire/fun-center-b");
    expect(tenantB).not.toContain("/inquire/fun-center-a");
    expect(tenantA).toContain('target="_blank"');
    expect(tenantA).toContain("noopener noreferrer");
    expect(tenantA).toContain("cursor-pointer");
    expect(tenantA).not.toContain("generations");
  });

  it("resolves the href from trusted request context, not a hardcoded slug", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/public-inquiry-nav-link.tsx"),
      "utf8",
    );
    expect(source).toContain("getCurrentTenantPublicInquiryPath");
    expect(source).toContain("getRequestContext");
    expect(source).not.toContain("generations");
    expect(source).not.toContain("organizationSlug");
  });
});
