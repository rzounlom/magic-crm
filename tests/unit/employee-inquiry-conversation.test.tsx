import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmployeeInquiryConversation } from "@/components/layout/employee-inquiry-conversation";
import { MESSAGE_SENDER_TYPES } from "@/types/inquiry";

function renderMessages(
  messages: Array<{ id: string; senderType: string; content: string }>,
) {
  return renderToStaticMarkup(<EmployeeInquiryConversation messages={messages} />);
}

describe("employee inquiry conversation markdown", () => {
  it("renders assistant bold markdown as strong text", () => {
    const html = renderMessages([
      {
        id: "ai-1",
        senderType: MESSAGE_SENDER_TYPES.AI,
        content:
          "For 10 bowlers, you'll need **2 lanes**.\n\nFriday pricing is **$40 per lane for one hour**, plus **$4 per person**.",
      },
    ]);
    expect(html).toContain("<strong>2 lanes</strong>");
    expect(html).toContain("<strong>$40 per lane for one hour</strong>");
    expect(html).toContain("<strong>$4 per person</strong>");
    expect(html).not.toContain("**2 lanes**");
    expect(html).not.toContain("**$40 per lane for one hour**");
  });

  it("renders assistant lists", () => {
    const html = renderMessages([
      {
        id: "ai-2",
        senderType: MESSAGE_SENDER_TYPES.AI,
        content: "- Laser tag\n- Arcade",
      },
    ]);
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Laser tag</li>");
    expect(html).toContain("<li>Arcade</li>");
  });

  it("does not make assistant HTML or scripts executable", () => {
    const html = renderMessages([
      {
        id: "ai-3",
        senderType: MESSAGE_SENDER_TYPES.AI,
        content: "<script>alert('x')</script>\n\n**Safe**",
      },
    ]);
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html).not.toContain("alert('x')");
    expect(html).toContain("<strong>Safe</strong>");
  });

  it("keeps customer text as escaped plain text", () => {
    const html = renderMessages([
      {
        id: "c-1",
        senderType: MESSAGE_SENDER_TYPES.CUSTOMER,
        content: "<script>alert('x')</script>\n**hello**",
      },
    ]);
    expect(html).toContain("&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;");
    expect(html).toContain("**hello**");
    expect(html).not.toContain("<strong>hello</strong>");
    expect(html.toLowerCase()).not.toContain("<script");
  });
});
