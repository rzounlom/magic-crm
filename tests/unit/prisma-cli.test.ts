import { describe, expect, it } from "vitest";

import {
  PRISMA_CONFIG_PLACEHOLDER_DIRECT_URL,
  prismaCommandRequiresDirectUrl,
  prismaSubcommand,
  resolvePrismaCliDatasourceUrl,
} from "@/lib/env/prisma-cli";
import { EnvValidationError } from "@/lib/env/validation";

const validDirectUrl = "postgresql://magiccrm:secret@127.0.0.1:5432/magiccrm_dev";

describe("prismaCommandRequiresDirectUrl", () => {
  it("allows schema-only commands without a live database", () => {
    expect(prismaCommandRequiresDirectUrl(["node", "prisma", "generate"])).toBe(false);
    expect(prismaCommandRequiresDirectUrl(["node", "prisma", "validate"])).toBe(false);
    expect(prismaCommandRequiresDirectUrl(["node", "prisma", "format"])).toBe(false);
  });

  it("requires DIRECT_URL for commands that can connect or mutate", () => {
    expect(prismaCommandRequiresDirectUrl(["node", "prisma", "migrate", "deploy"])).toBe(true);
    expect(prismaCommandRequiresDirectUrl(["node", "prisma", "migrate", "status"])).toBe(true);
    expect(prismaCommandRequiresDirectUrl(["node", "prisma", "studio"])).toBe(true);
    expect(prismaCommandRequiresDirectUrl(["node", "prisma", "db", "pull"])).toBe(true);
    expect(prismaSubcommand(["node", "/abs/prisma/build/index.js", "migrate", "deploy"])).toBe(
      "migrate",
    );
  });
});

describe("resolvePrismaCliDatasourceUrl", () => {
  it("returns a config placeholder only for schema-only commands", () => {
    expect(resolvePrismaCliDatasourceUrl({}, ["node", "prisma", "generate"])).toBe(
      PRISMA_CONFIG_PLACEHOLDER_DIRECT_URL,
    );
  });

  it("fails closed for migrate when DIRECT_URL is missing", () => {
    expect(() =>
      resolvePrismaCliDatasourceUrl({}, ["node", "prisma", "migrate", "deploy"]),
    ).toThrow(EnvValidationError);
    expect(() =>
      resolvePrismaCliDatasourceUrl({}, ["node", "prisma", "migrate", "deploy"]),
    ).toThrow(/DIRECT_URL is required/);
  });

  it("does not treat the placeholder as a live database", () => {
    expect(() =>
      resolvePrismaCliDatasourceUrl(
        { DIRECT_URL: PRISMA_CONFIG_PLACEHOLDER_DIRECT_URL },
        ["node", "prisma", "migrate", "deploy"],
      ),
    ).toThrow(/DIRECT_URL is required for Prisma commands that connect/);
  });

  it("does not echo secrets when DIRECT_URL is malformed", () => {
    try {
      resolvePrismaCliDatasourceUrl(
        { DIRECT_URL: "https://user:super-secret-password@example.test/db" },
        ["node", "prisma", "migrate", "deploy"],
      );
      throw new Error("expected resolvePrismaCliDatasourceUrl to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect(String(error)).not.toContain("super-secret-password");
      expect(String(error)).not.toContain("example.test");
    }
  });

  it("returns a valid DIRECT_URL for connecting commands", () => {
    expect(
      resolvePrismaCliDatasourceUrl({ DIRECT_URL: validDirectUrl }, [
        "node",
        "prisma",
        "migrate",
        "deploy",
      ]),
    ).toBe(validDirectUrl);
  });
});
