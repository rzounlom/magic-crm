import { describe, expect, it } from "vitest";

import {
  buildOpenAiSalesAgentCreateParams,
  readOpenAiResponseText,
} from "@/lib/ai/openai-sales-agent-request";
import { SALES_AGENT_TOOL_DEFINITIONS } from "@/server/ai/sales-agent-tools";

describe("OpenAI sales agent request construction", () => {
  it("uses the Responses API with store disabled and no tenant authority from the model", () => {
    const params = buildOpenAiSalesAgentCreateParams({
      model: "gpt-4.1-mini",
      instructions: "Event Assistant",
      input: [{ role: "user", content: "How much is bowling?" }],
      tools: SALES_AGENT_TOOL_DEFINITIONS,
      maxOutputTokens: 700,
    });

    expect(params.store).toBe(false);
    expect(params.model).toBe("gpt-4.1-mini");
    expect(params.max_output_tokens).toBe(700);
    expect(params.tools.map((tool) => tool.name)).toEqual([
      "search_sales_knowledge",
      "get_inquiry_details",
      "update_inquiry_details",
      "request_human_handoff",
    ]);
    expect(params.tools.every((tool) => tool.strict === false)).toBe(true);
    expect(params.tools.find((tool) => tool.name === "request_human_handoff")?.description).toMatch(
      /Do not call merely because the lead is qualified/i,
    );
    expect(JSON.stringify(params)).not.toContain("organizationId");
    expect(JSON.stringify(params.tools)).not.toContain("BOOK");
  });

  it("reads output_text and falls back to message parts", () => {
    expect(readOpenAiResponseText({ output_text: "  Direct reply.  ", output: [] })).toBe("Direct reply.");
    expect(
      readOpenAiResponseText({
        output_text: "",
        output: [
          {
            type: "function_call",
            content: [],
          },
          {
            type: "message",
            content: [{ type: "output_text", text: "From message item." }],
          },
        ],
      }),
    ).toBe("From message item.");
    expect(readOpenAiResponseText({ output_text: "", output: [{ type: "function_call" }] })).toBe("");
  });
});
