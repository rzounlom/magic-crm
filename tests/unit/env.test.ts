import { describe, expect, it } from "vitest";

import {
  assertTestDatabaseIsIsolated,
  EnvValidationError,
  parsePrismaCliEnv,
  parseRuntimeEnv,
  parseTestDatabaseEnv,
} from "@/lib/env/validation";

const validPostgresUrl = "postgresql://magiccrm:secret@127.0.0.1:5432/magiccrm_dev";

describe("parseRuntimeEnv", () => {
  it("accepts a valid pooled DATABASE_URL", () => {
    const env = parseRuntimeEnv({ DATABASE_URL: validPostgresUrl });
    expect(env.DATABASE_URL).toBe(validPostgresUrl);
  });

  it("accepts the postgres:// protocol", () => {
    const env = parseRuntimeEnv({
      DATABASE_URL: "postgres://magiccrm:secret@127.0.0.1:5432/magiccrm_dev",
    });
    expect(env.DATABASE_URL).toContain("postgres://");
  });

  it("fails clearly when DATABASE_URL is missing", () => {
    expect(() => parseRuntimeEnv({})).toThrow(EnvValidationError);
    expect(() => parseRuntimeEnv({})).toThrow(/DATABASE_URL is required/);
  });

  it("fails clearly when DATABASE_URL is empty", () => {
    expect(() => parseRuntimeEnv({ DATABASE_URL: "   " })).toThrow(/DATABASE_URL is required/);
  });

  it("treats Clerk keys as optional and does not require live Clerk credentials", () => {
    const env = parseRuntimeEnv({ DATABASE_URL: validPostgresUrl });
    expect(env.CLERK_SECRET_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBeUndefined();
  });

  it("rejects a malformed value without echoing the secret", () => {
    try {
      parseRuntimeEnv({ DATABASE_URL: "not-a-url" });
      throw new Error("expected parseRuntimeEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect(String(error)).toMatch(/DATABASE_URL must be a valid PostgreSQL connection URL/);
      expect(String(error)).not.toContain("not-a-url");
    }

    try {
      parseRuntimeEnv({ DATABASE_URL: "https://user:super-secret-password@example.test/db" });
      throw new Error("expected parseRuntimeEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect(String(error)).not.toContain("example.test");
      expect(String(error)).not.toContain("super-secret-password");
    }
  });
});

describe("parseTestDatabaseEnv", () => {
  it("requires an explicit test database role", () => {
    expect(() =>
      parseTestDatabaseEnv({
        DATABASE_URL: validPostgresUrl,
        DIRECT_URL: validPostgresUrl,
      }),
    ).toThrow(/MAGICCRM_DATABASE_ROLE/);
  });

  it("rejects a test URL that matches development", () => {
    const testEnv = parseTestDatabaseEnv({
      MAGICCRM_DATABASE_ROLE: "test",
      DATABASE_URL: validPostgresUrl,
      DIRECT_URL: validPostgresUrl,
    });

    expect(() =>
      assertTestDatabaseIsIsolated(testEnv, { DATABASE_URL: validPostgresUrl }),
    ).toThrow(/must not match the development database/);
  });
});

describe("parsePrismaCliEnv", () => {
  it("accepts a valid DIRECT_URL", () => {
    const env = parsePrismaCliEnv({ DIRECT_URL: validPostgresUrl });
    expect(env.DIRECT_URL).toBe(validPostgresUrl);
  });

  it("fails clearly when DIRECT_URL is missing", () => {
    expect(() => parsePrismaCliEnv({})).toThrow(/DIRECT_URL is required/);
  });
});
