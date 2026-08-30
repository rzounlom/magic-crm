import { EnvValidationError, parsePrismaCliEnv } from "./validation";

/**
 * Used only so Prisma can parse prisma.config.ts for schema-only commands
 * (validate/generate/format). Connecting commands must never use this value.
 */
export const PRISMA_CONFIG_PLACEHOLDER_DIRECT_URL =
  "postgresql://127.0.0.1:5432/magiccrm_prisma_config_placeholder";

const SCHEMA_ONLY_COMMANDS = new Set(["generate", "validate", "format"]);

export function prismaSubcommand(argv: readonly string[]): string | undefined {
  const tokens = argv.filter((arg) => arg.length > 0 && !arg.startsWith("-"));
  const prismaIndex = tokens.findIndex(
    (token) => token === "prisma" || token.endsWith("/prisma") || token.includes("/prisma/"),
  );

  if (prismaIndex >= 0) {
    return tokens[prismaIndex + 1];
  }

  return tokens[2];
}

export function prismaCommandRequiresDirectUrl(argv: readonly string[]): boolean {
  const command = prismaSubcommand(argv);
  if (!command) {
    return true;
  }

  return !SCHEMA_ONLY_COMMANDS.has(command);
}

export function resolvePrismaCliDatasourceUrl(
  source: NodeJS.Dict<string>,
  argv: readonly string[],
): string {
  const requiresLiveDatabase = prismaCommandRequiresDirectUrl(argv);

  try {
    const parsed = parsePrismaCliEnv(source);

    if (requiresLiveDatabase && parsed.DIRECT_URL === PRISMA_CONFIG_PLACEHOLDER_DIRECT_URL) {
      throw new EnvValidationError([
        "DIRECT_URL is required for Prisma commands that connect to a database",
      ]);
    }

    return parsed.DIRECT_URL;
  } catch (error) {
    if (error instanceof EnvValidationError && !requiresLiveDatabase) {
      return PRISMA_CONFIG_PLACEHOLDER_DIRECT_URL;
    }

    throw error;
  }
}
