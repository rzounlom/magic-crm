import { describe, expect, it } from "vitest";

import {
  createPublicConversationToken,
  hashPublicConversationToken,
  isPlausiblePublicConversationToken,
} from "@/lib/ai/public-conversation-token";

describe("public conversation token", () => {
  it("creates a high-entropy token that hashes consistently", () => {
    const created = createPublicConversationToken();
    expect(created.token).not.toEqual(created.hash);
    expect(hashPublicConversationToken(created.token)).toBe(created.hash);
    expect(isPlausiblePublicConversationToken(created.token)).toBe(true);
    expect(isPlausiblePublicConversationToken("inquiry_123")).toBe(false);
  });
});
