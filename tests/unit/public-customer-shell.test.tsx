import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicConversationView } from "@/components/layout/public-conversation-view";
import { PublicCustomerShell } from "@/components/layout/public-customer-shell";
import { PublicInquiryView } from "@/components/layout/public-inquiry-view";
import { SiteShell } from "@/components/layout/site-shell";
import { customerFacingOrganizationName } from "@/lib/inquiries/organization-display-name";
import { MESSAGE_SENDER_TYPES } from "@/types/inquiry";

const GENERATED_SLUG = "generations-crm-test-1788129640704833684";
const DISPLAY_NAME = customerFacingOrganizationName(GENERATED_SLUG);

function visibleCustomerCopy(html: string) {
  return html
    .replace(/<input\b[^>]*type="hidden"[^>]*>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderPublicInquiry() {
  return renderToStaticMarkup(
    <PublicCustomerShell>
      <PublicInquiryView organizationName={DISPLAY_NAME}>
        <button type="submit">Start conversation</button>
      </PublicInquiryView>
    </PublicCustomerShell>,
  );
}

function renderPublicConversation() {
  return renderToStaticMarkup(
    <PublicCustomerShell>
      <PublicConversationView
        organizationName={DISPLAY_NAME}
        messages={[
          {
            id: "msg-1",
            senderType: MESSAGE_SENDER_TYPES.AI,
            content: "How can I help with your event?",
          },
        ]}
      >
        <button type="submit">Send message</button>
      </PublicConversationView>
    </PublicCustomerShell>,
  );
}

describe("public customer shell", () => {
  it("keeps employee sign-in on the MagicCRM landing shell", () => {
    const html = renderToStaticMarkup(
      <SiteShell>
        <p>Landing</p>
      </SiteShell>,
    );
    expect(html).toContain("Employee sign in");
    expect(html).toContain('href="/sign-in"');
  });

  it("does not show Employee sign in on the public inquiry route", () => {
    const html = renderPublicInquiry();
    expect(html).not.toContain("Employee sign in");
    expect(html).toContain("Plan an event");
    expect(html).toContain("MagicCRM");
  });

  it("does not show Employee sign in on the public conversation route", () => {
    const html = renderPublicConversation();
    expect(html).not.toContain("Employee sign in");
    expect(html).toContain("Event Assistant");
  });

  it("does not render OrganizationSwitcher or Clerk UserButton on public routes", () => {
    const inquiry = renderPublicInquiry();
    const conversation = renderPublicConversation();
    const shellSource = readFileSync(
      path.join(process.cwd(), "src/components/layout/public-customer-shell.tsx"),
      "utf8",
    );

    for (const html of [inquiry, conversation]) {
      expect(html).not.toContain("OrganizationSwitcher");
      expect(html).not.toContain("UserButton");
      expect(html).not.toContain("data-employee-account");
      expect(html).not.toContain("Team");
      expect(html).not.toContain("Security");
      expect(html).not.toContain("Inquiries");
      expect(html).not.toContain("Public Inquiry");
      expect(html).not.toContain("/app");
      expect(html).not.toContain("/sign-in");
    }

    expect(shellSource).not.toContain("@clerk/nextjs");
    expect(shellSource).not.toContain("OrganizationSwitcher");
    expect(shellSource).not.toContain("UserButton");
    expect(shellSource).not.toContain("Employee sign in");
  });

  it("shows the organization display name on the public conversation", () => {
    const html = renderPublicConversation();
    expect(html).toContain(DISPLAY_NAME);
    expect(html).toContain(`virtual Event Assistant for ${DISPLAY_NAME}`);
  });

  it("does not put a generated slug in public headings, buttons, or descriptive copy", () => {
    const inquiryCopy = visibleCustomerCopy(renderPublicInquiry());
    const conversationCopy = visibleCustomerCopy(renderPublicConversation());

    expect(inquiryCopy).toContain(DISPLAY_NAME);
    expect(conversationCopy).toContain(DISPLAY_NAME);
    expect(inquiryCopy.toLowerCase()).not.toContain(GENERATED_SLUG);
    expect(conversationCopy.toLowerCase()).not.toContain(GENERATED_SLUG);
    expect(inquiryCopy).not.toMatch(/generations-crm-test/i);
    expect(conversationCopy).not.toMatch(/generations-crm-test/i);
  });

  it("uses layout composition instead of SiteShell on public customer routes", () => {
    const inquireLayout = readFileSync(
      path.join(process.cwd(), "src/app/inquire/layout.tsx"),
      "utf8",
    );
    const conversationLayout = readFileSync(
      path.join(process.cwd(), "src/app/conversation/layout.tsx"),
      "utf8",
    );
    const inquirePage = readFileSync(
      path.join(process.cwd(), "src/app/inquire/[organizationSlug]/page.tsx"),
      "utf8",
    );
    const conversationPage = readFileSync(
      path.join(process.cwd(), "src/app/conversation/[token]/page.tsx"),
      "utf8",
    );
    const appLayout = readFileSync(path.join(process.cwd(), "src/app/app/layout.tsx"), "utf8");

    expect(inquireLayout).toContain("PublicCustomerShell");
    expect(conversationLayout).toContain("PublicCustomerShell");
    expect(inquirePage).not.toContain("SiteShell");
    expect(inquirePage).not.toContain("Employee sign in");
    expect(conversationPage).not.toContain("SiteShell");
    expect(conversationPage).not.toContain("Employee sign in");
    expect(appLayout).toContain("EmployeeShell");
    expect(appLayout).not.toContain("PublicCustomerShell");
  });
});
