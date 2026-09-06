import { describe, expect, it } from "vitest";

import {
  assertTestDatabaseIsIsolated,
  EnvValidationError,
  parsePrismaCliEnv,
  parseRuntimeEnv,
  parseTestDatabaseEnv,
} from "@/lib/env/validation";

const validPostgresUrl = "postgresql://magiccrm:secret@127.0.0.1:5432/magiccrm_dev";
const validAppUrl = "http://localhost:3000";

describe("parseRuntimeEnv", () => {
  it("accepts a valid pooled DATABASE_URL", () => {
    const env = parseRuntimeEnv({ DATABASE_URL: validPostgresUrl, APP_URL: validAppUrl });
    expect(env.DATABASE_URL).toBe(validPostgresUrl);
    expect(env.APP_URL).toBe(validAppUrl);
  });

  it("accepts the postgres:// protocol", () => {
    const env = parseRuntimeEnv({
      DATABASE_URL: "postgres://magiccrm:secret@127.0.0.1:5432/magiccrm_dev",
      APP_URL: validAppUrl,
    });
    expect(env.DATABASE_URL).toContain("postgres://");
  });

  it("fails clearly when DATABASE_URL is missing", () => {
    expect(() => parseRuntimeEnv({ APP_URL: validAppUrl })).toThrow(EnvValidationError);
    expect(() => parseRuntimeEnv({ APP_URL: validAppUrl })).toThrow(/DATABASE_URL is required/);
  });

  it("fails clearly when DATABASE_URL is empty", () => {
    expect(() => parseRuntimeEnv({ DATABASE_URL: "   ", APP_URL: validAppUrl })).toThrow(
      /DATABASE_URL is required/,
    );
  });

  it("fails clearly when APP_URL is missing", () => {
    expect(() => parseRuntimeEnv({ DATABASE_URL: validPostgresUrl })).toThrow(/APP_URL is required/);
  });

  it("accepts a production https origin and localhost http", () => {
    expect(
      parseRuntimeEnv({
        DATABASE_URL: validPostgresUrl,
        APP_URL: "https://crm.example.com",
      }).APP_URL,
    ).toBe("https://crm.example.com");
    expect(
      parseRuntimeEnv({
        DATABASE_URL: validPostgresUrl,
        APP_URL: "http://localhost:3000/",
      }).APP_URL,
    ).toBe("http://localhost:3000");
  });

  it("rejects a non-local http APP_URL and a malformed origin", () => {
    expect(() =>
      parseRuntimeEnv({ DATABASE_URL: validPostgresUrl, APP_URL: "http://example.com" }),
    ).toThrow(EnvValidationError);
    expect(() =>
      parseRuntimeEnv({ DATABASE_URL: validPostgresUrl, APP_URL: "not-a-url" }),
    ).toThrow(EnvValidationError);
    expect(() =>
      parseRuntimeEnv({ DATABASE_URL: validPostgresUrl, APP_URL: "https://evil.test/phish" }),
    ).toThrow(EnvValidationError);
  });

  it("treats Clerk keys as optional and does not require live Clerk credentials", () => {
    const env = parseRuntimeEnv({ DATABASE_URL: validPostgresUrl, APP_URL: validAppUrl });
    expect(env.CLERK_SECRET_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBeUndefined();
  });

  it("treats OpenAI keys as optional and accepts an explicit sales model", () => {
    const withoutKey = parseRuntimeEnv({ DATABASE_URL: validPostgresUrl, APP_URL: validAppUrl });
    expect(withoutKey.OPENAI_API_KEY).toBeUndefined();
    expect(withoutKey.OPENAI_SALES_MODEL).toBeUndefined();
    const withKey = parseRuntimeEnv({
      DATABASE_URL: validPostgresUrl,
      APP_URL: validAppUrl,
      OPENAI_API_KEY: "sk-test",
      OPENAI_SALES_MODEL: "gpt-4.1-mini",
    });
    expect(withKey.OPENAI_API_KEY).toBe("sk-test");
    expect(withKey.OPENAI_SALES_MODEL).toBe("gpt-4.1-mini");
  });

  it("rejects a malformed value without echoing the secret", () => {
    try {
      parseRuntimeEnv({ DATABASE_URL: "not-a-url", APP_URL: validAppUrl });
      throw new Error("expected parseRuntimeEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect(String(error)).toMatch(/DATABASE_URL must be a valid PostgreSQL connection URL/);
      expect(String(error)).not.toContain("not-a-url");
    }

    try {
      parseRuntimeEnv({
        DATABASE_URL: "https://user:super-secret-password@example.test/db",
        APP_URL: validAppUrl,
      });
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
