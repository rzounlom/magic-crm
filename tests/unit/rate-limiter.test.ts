import { describe, expect, it } from "vitest";

import { createMemoryRateLimiter } from "@/lib/ai/rate-limiter";

describe("memory rate limiter", () => {
  it("allows requests under the limit and blocks after", async () => {
    let now = 1_000;
    const limiter = createMemoryRateLimiter(() => now);
    expect((await limiter.consume("a", 2, 1_000)).ok).toBe(true);
    expect((await limiter.consume("a", 2, 1_000)).ok).toBe(true);
    expect((await limiter.consume("a", 2, 1_000)).ok).toBe(false);
    now = 3_000;
    expect((await limiter.consume("a", 2, 1_000)).ok).toBe(true);
  });
});
