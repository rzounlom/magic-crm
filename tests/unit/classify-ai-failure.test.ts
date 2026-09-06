import { describe, expect, it } from "vitest";

import { classifyAiFailure } from "@/server/ai/classify-ai-failure";

describe("classifyAiFailure", () => {
  it("classifies timeout, rate limit, and 5xx separately", () => {
    expect(classifyAiFailure({ name: "APIConnectionTimeoutError", message: "Request timed out" })).toEqual({
      category: "OPENAI_TIMEOUT",
      httpStatus: null,
    });
    expect(classifyAiFailure({ status: 429 })).toEqual({
      category: "OPENAI_RATE_LIMIT",
      httpStatus: 429,
    });
    expect(classifyAiFailure({ status: 503 })).toEqual({
      category: "OPENAI_UNAVAILABLE",
      httpStatus: 503,
    });
    expect(classifyAiFailure({ message: "malformed" })).toEqual({
      category: "OPENAI_FAILURE",
      httpStatus: null,
    });
  });
});
