import { z } from "zod";

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

export const runtimeEnvSchema = z.object({
  DATABASE_URL: postgresUrl("DATABASE_URL"),
});

export const prismaCliEnvSchema = z.object({
  DIRECT_URL: postgresUrl("DIRECT_URL"),
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;
export type PrismaCliEnv = z.infer<typeof prismaCliEnvSchema>;

function issueMessages(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}

export function parseRuntimeEnv(source: NodeJS.Dict<string>): RuntimeEnv {
  const result = runtimeEnvSchema.safeParse({
    DATABASE_URL: source.DATABASE_URL,
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
