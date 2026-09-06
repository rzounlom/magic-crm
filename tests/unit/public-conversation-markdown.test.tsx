import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicConversationView } from "@/components/layout/public-conversation-view";
import { MESSAGE_SENDER_TYPES } from "@/types/inquiry";

function renderConversation(
  messages: Array<{ id: string; senderType: string; content: string }>,
) {
  return renderToStaticMarkup(
    <PublicConversationView organizationName="Riverside Fun Center" messages={messages}>
      <button type="submit">Send message</button>
    </PublicConversationView>,
  );
}

function assistantMessage(content: string, id = "ai-1") {
  return { id, senderType: MESSAGE_SENDER_TYPES.AI, content };
}

function customerMessage(content: string, id = "cust-1") {
  return { id, senderType: MESSAGE_SENDER_TYPES.CUSTOMER, content };
}

describe("public conversation assistant markdown", () => {
  it("renders bold markdown as strong text without visible markers", () => {
    const html = renderConversation([
      assistantMessage(
        "**Have a Blast Birthday Package**\n**90 minutes of unlimited laser tag**\n**$489.95**",
      ),
    ]);

    expect(html).toContain("<strong>Have a Blast Birthday Package</strong>");
    expect(html).toContain("<strong>$489.95</strong>");
    expect(html).not.toContain("**Have a Blast Birthday Package**");
    expect(html).not.toContain("**$489.95**");
  });

  it("renders paragraphs separately", () => {
    const html = renderConversation([
      assistantMessage("First thought.\n\nSecond thought."),
    ]);

    expect(html).toContain("<p>First thought.</p>");
    expect(html).toContain("<p>Second thought.</p>");
    expect(html.indexOf("<p>First thought.</p>")).toBeLessThan(
      html.indexOf("<p>Second thought.</p>"),
    );
  });

  it("renders unordered and ordered lists", () => {
    const html = renderConversation([
      assistantMessage("- Laser tag\n- Arcade\n\n1. Pick a date\n2. Confirm the guest count"),
    ]);

    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>Laser tag</li>");
    expect(html).toContain("<li>Arcade</li>");
    expect(html).toContain("<li>Pick a date</li>");
    expect(html).toContain("<li>Confirm the guest count</li>");
  });

  it("does not render assistant raw HTML as HTML", () => {
    const html = renderConversation([
      assistantMessage('<em data-injected="yes">injected</em> and <strong>html-bold</strong>'),
    ]);

    expect(html).not.toContain('data-injected="yes"');
    expect(html).not.toContain("<em");
    expect(html).not.toContain("<strong>html-bold</strong>");
  });

  it("does not emit executable script tags from assistant HTML", () => {
    const html = renderConversation([
      assistantMessage("<script>alert('x')</script>\n\nThanks for reaching out."),
    ]);

    expect(html.toLowerCase()).not.toContain("<script");
    expect(html).not.toContain("alert('x')");
    expect(html).toContain("Thanks for reaching out.");
  });

  it("keeps customer messages as escaped plain text", () => {
    const html = renderConversation([customerMessage("<script>alert('x')</script>")]);

    expect(html).toContain("You");
    expect(html).toContain("&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;");
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("does not interpret customer markdown", () => {
    const html = renderConversation([customerMessage("**hello**")]);

    expect(html).toContain("**hello**");
    expect(html).not.toContain("<strong>hello</strong>");
  });

  it("still renders plain-text assistant messages", () => {
    const html = renderConversation([
      assistantMessage("How can I help with your event?"),
    ]);

    expect(html).toContain("How can I help with your event?");
    expect(html).not.toContain("**");
  });

  it("does not use dangerouslySetInnerHTML for model output", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/assistant-markdown.tsx"),
      "utf8",
    );
    expect(source).toContain("react-markdown");
    expect(source).toContain("skipHtml");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toContain("rehype-raw");
  });
});
