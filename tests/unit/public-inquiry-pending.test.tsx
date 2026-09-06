import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PUBLIC_INQUIRY_PENDING_COPY,
  PUBLIC_INQUIRY_PREPARING_COPY,
  PublicInquiryPendingBanner,
} from "@/components/layout/public-inquiry-pending";
import { PendingActionProvider, PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { onSafeSubmitAttempt } from "@/lib/ui/confirm-gate";

describe("public inquiry pending UX", () => {
  it("shows pending copy and disables submit while work is in progress", () => {
    const html = renderToStaticMarkup(
      <PendingActionProvider pending>
        <PublicInquiryPendingBanner />
        <PendingSubmitButton pendingLabel={PUBLIC_INQUIRY_PENDING_COPY}>
          Start conversation
        </PendingSubmitButton>
      </PendingActionProvider>,
    );
    expect(html).toContain(PUBLIC_INQUIRY_PENDING_COPY);
    expect(html).toContain(PUBLIC_INQUIRY_PREPARING_COPY);
    expect(html).toContain("disabled");
    expect(html).toContain("cursor-not-allowed");
    expect(html).not.toContain("OpenAI");
    expect(html).not.toContain("tokens");
    expect(html).not.toContain("gpt");
  });

  it("blocks duplicate submits while pending and allows retry after error", () => {
    expect(onSafeSubmitAttempt(true)).toBe("block");
    expect(onSafeSubmitAttempt(false)).toBe("run");
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/public-inquiry-form.tsx"),
      "utf8",
    );
    expect(source).toContain("onSafeSubmitAttempt");
    expect(source).toContain("setPending(false)");
    expect(source).toContain("yieldToPaint");
    expect(source).toContain("onSubmit");
    expect(source).toContain("PUBLIC_INQUIRY_PENDING_COPY");
    expect(source).toContain("PublicInquiryPendingBanner");
  });
});
