import { describe, expect, it } from "vitest";

import {
  evaluateSalesAgentHandoff,
  HUMAN_HANDOFF_TOOL_DESCRIPTION,
  looksLikeHandoffFarewell,
  SALES_AGENT_HANDOFF_POLICY,
} from "@/server/ai/handoff-policy";
import { salesAgentInstructions } from "@/server/ai/sales-agent-instructions";
import { SALES_AGENT_TOOL_DEFINITIONS } from "@/server/ai/sales-agent-tools";
import { AI_HANDOFF_CUSTOMER_MESSAGE } from "@/types/inquiry";

describe("sales-agent handoff policy", () => {
  it.each([
    ["How much is Have a Blast for 14 kids?", "normal_sales"],
    ["What's included in Have It All?", "normal_sales"],
    ["Can my 14 year old axe throw?", "normal_sales"],
    ["What's the birthday deposit?", "normal_sales"],
    ["What can a 10 year old do at Raceway?", "normal_sales"],
    ["What time are you open Thursday?", "normal_sales"],
    ["What can a 10 year old do at Generations Raceway?", "normal_sales"],
    ["Can you give me a discount?", "normal_sales"],
    ["Can you give me a 25% discount?", "normal_sales"],
  ] as const)("does not hand off for %s", (message, category) => {
    expect(evaluateSalesAgentHandoff({ lastCustomerMessage: message })).toEqual({
      allow: false,
      category,
    });
  });

  it.each([
    ["Can I talk to someone?", "explicit_human"],
    ["I'd like someone to call me.", "explicit_human"],
    ["Is Saturday at 4 available?", "booking_availability"],
    ["Please reserve Saturday at 4.", "booking_availability"],
    ["Can you approve a custom discounted price for me?", "human_approval"],
  ] as const)("hands off for %s", (message, category) => {
    expect(evaluateSalesAgentHandoff({ lastCustomerMessage: message })).toEqual({
      allow: true,
      category,
    });
  });

  it("does not treat a preferred date or qualified intake as a handoff", () => {
    expect(
      evaluateSalesAgentHandoff({
        lastCustomerMessage:
          "Planning: Birthday party\nPreferred date: 2026-09-11\nApproximate start: 13:00\nGuest count: 14\nNotes: I'm planning my daughter's 11th birthday.",
      }),
    ).toEqual({ allow: false, category: "unspecified" });
  });

  it("keeps the canned farewell from being treated as a real sales reply", () => {
    expect(looksLikeHandoffFarewell(AI_HANDOFF_CUSTOMER_MESSAGE)).toBe(true);
    expect(looksLikeHandoffFarewell("Have a Blast for 14 kids is $489.95.")).toBe(false);
  });

  it("centralizes conservative handoff wording in instructions and the tool", () => {
    const handoffTool = SALES_AGENT_TOOL_DEFINITIONS.find((tool) => tool.name === "request_human_handoff");
    expect(handoffTool?.description).toBe(HUMAN_HANDOFF_TOOL_DESCRIPTION);
    expect(HUMAN_HANDOFF_TOOL_DESCRIPTION).toMatch(/Do not call merely because the lead is qualified/);
    expect(salesAgentInstructions("Riverside Fun Center")).toContain(SALES_AGENT_HANDOFF_POLICY);
    expect(SALES_AGENT_HANDOFF_POLICY).not.toMatch(/generations/i);
    expect(HUMAN_HANDOFF_TOOL_DESCRIPTION).not.toMatch(/generations/i);
  });
});
