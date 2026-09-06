import { z } from "zod";

import { ApplicationUrlError, parseApplicationOrigin } from "./application-url";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid server environment:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

function isPostgresConnectionUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return POSTGRES_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function postgresUrl(fieldName: string) {
  return z
    .string({ error: `${fieldName} is required` })
    .trim()
    .min(1, { error: `${fieldName} is required` })
    .refine(isPostgresConnectionUrl, {
      error: `${fieldName} must be a valid PostgreSQL connection URL`,
    });
}

function optionalNonEmptyString(fieldName: string) {
  return z
    .string({ error: `${fieldName} is required` })
    .trim()
    .min(1, { error: `${fieldName} is required` })
    .optional();
}

function applicationOrigin() {
  return z
    .string({ error: "APP_URL is required" })
    .trim()
    .min(1, { error: "APP_URL is required" })
    .transform((value, context) => {
      try {
        return parseApplicationOrigin(value);
      } catch (error) {
        context.addIssue({
          code: "custom",
          message:
            error instanceof ApplicationUrlError
              ? error.message
              : "APP_URL must be an absolute http(s) origin",
        });
        return z.NEVER;
      }
    });
}

export const runtimeEnvSchema = z.object({
  DATABASE_URL: postgresUrl("DATABASE_URL"),
  APP_URL: applicationOrigin(),
  CLERK_SECRET_KEY: z
    .string({ error: "CLERK_SECRET_KEY is required" })
    .trim()
    .min(1, { error: "CLERK_SECRET_KEY is required" })
    .optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalNonEmptyString("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  OPENAI_API_KEY: optionalNonEmptyString("OPENAI_API_KEY"),
  OPENAI_SALES_MODEL: z
    .string()
    .trim()
    .min(1)
    .optional()
    .transform((value) => value || undefined),
});

export const prismaCliEnvSchema = z.object({
  DIRECT_URL: postgresUrl("DIRECT_URL"),
});

export const testDatabaseEnvSchema = z.object({
  MAGICCRM_DATABASE_ROLE: z.literal("test", {
    error: "MAGICCRM_DATABASE_ROLE must be exactly \"test\" for integration tests",
  }),
  DATABASE_URL: postgresUrl("DATABASE_URL"),
  DIRECT_URL: postgresUrl("DIRECT_URL"),
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;
export type PrismaCliEnv = z.infer<typeof prismaCliEnvSchema>;
export type TestDatabaseEnv = z.infer<typeof testDatabaseEnvSchema>;

function issueMessages(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}

export function parseRuntimeEnv(source: NodeJS.Dict<string>): RuntimeEnv {
  const result = runtimeEnvSchema.safeParse({
    DATABASE_URL: source.DATABASE_URL,
    APP_URL: source.APP_URL,
    CLERK_SECRET_KEY: source.CLERK_SECRET_KEY || undefined,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: source.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || undefined,
    OPENAI_API_KEY: source.OPENAI_API_KEY || undefined,
    OPENAI_SALES_MODEL: source.OPENAI_SALES_MODEL || undefined,
  });

  if (!result.success) {
    throw new EnvValidationError(issueMessages(result.error));
  }

  return result.data;
}

export function parsePrismaCliEnv(source: NodeJS.Dict<string>): PrismaCliEnv {
  const result = prismaCliEnvSchema.safeParse({
    DIRECT_URL: source.DIRECT_URL,
  });

  if (!result.success) {
    throw new EnvValidationError(issueMessages(result.error));
  }

  return result.data;
}

export function parseTestDatabaseEnv(source: NodeJS.Dict<string>): TestDatabaseEnv {
  const result = testDatabaseEnvSchema.safeParse({
    MAGICCRM_DATABASE_ROLE: source.MAGICCRM_DATABASE_ROLE,
    DATABASE_URL: source.DATABASE_URL,
    DIRECT_URL: source.DIRECT_URL,
  });

  if (!result.success) {
    throw new EnvValidationError(issueMessages(result.error));
  }

  return result.data;
}

export function assertTestDatabaseIsIsolated(
  testEnv: Pick<TestDatabaseEnv, "DATABASE_URL" | "DIRECT_URL">,
  developmentEnv: NodeJS.Dict<string>,
): void {
  if (developmentEnv.DATABASE_URL && developmentEnv.DATABASE_URL === testEnv.DATABASE_URL) {
    throw new EnvValidationError([
      "Test DATABASE_URL must not match the development database",
    ]);
  }

  if (developmentEnv.DIRECT_URL && developmentEnv.DIRECT_URL === testEnv.DIRECT_URL) {
    throw new EnvValidationError([
      "Test DIRECT_URL must not match the development database",
    ]);
  }
}
