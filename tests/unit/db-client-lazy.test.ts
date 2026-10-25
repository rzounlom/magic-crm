import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("db client lazy initialization", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("imports without DATABASE_URL or APP_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("APP_URL", "");
    const { db } = await import("@/lib/db/client");
    expect(db).toBeTruthy();
  });

  it("validates DATABASE_URL only when a query is attempted", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    const { db } = await import("@/lib/db/client");
    expect(() => {
      void db.$queryRaw;
    }).toThrow(/DATABASE_URL is required/);
  });
});
