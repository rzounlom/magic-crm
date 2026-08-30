import { describe, expect, it } from "vitest";

import { EnvValidationError, parsePrismaCliEnv, parseRuntimeEnv } from "@/lib/env/validation";

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

describe("parsePrismaCliEnv", () => {
  it("accepts a valid DIRECT_URL", () => {
    const env = parsePrismaCliEnv({ DIRECT_URL: validPostgresUrl });
    expect(env.DIRECT_URL).toBe(validPostgresUrl);
  });

  it("fails clearly when DIRECT_URL is missing", () => {
    expect(() => parsePrismaCliEnv({})).toThrow(/DIRECT_URL is required/);
  });
});
