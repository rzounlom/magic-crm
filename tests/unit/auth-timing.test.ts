import { afterEach, describe, expect, it, vi } from "vitest";

import { markAuthTiming, resetAuthTiming } from "@/lib/auth/auth-timing";

describe("markAuthTiming", () => {
  afterEach(() => {
    resetAuthTiming();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not log outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    markAuthTiming("route_mount", { route: "/sign-in", token: "secret-value" });
    expect(info).not.toHaveBeenCalled();
  });

  it("logs safe checkpoints in development and strips secret-like keys", () => {
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    markAuthTiming("route_mount", { route: "/sign-in" });
    markAuthTiming("clerk_loaded", {
      isSignedIn: true,
      sessionToken: "should-not-appear",
      cookie: "nope",
    });
    expect(info).toHaveBeenCalled();
    const payload = String(info.mock.calls.at(-1)?.[0] ?? "");
    expect(payload).toContain("magiccrm.auth1");
    expect(payload).toContain("clerk_loaded");
    expect(payload).not.toContain("should-not-appear");
    expect(payload).not.toContain("sessionToken");
    expect(payload).not.toContain("cookie");
  });
});
