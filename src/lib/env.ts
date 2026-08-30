import "server-only";

import { parseRuntimeEnv, type RuntimeEnv } from "@/lib/env/validation";

export type { RuntimeEnv } from "@/lib/env/validation";
export { EnvValidationError, parsePrismaCliEnv, parseRuntimeEnv } from "@/lib/env/validation";

let cached: RuntimeEnv | undefined;

export function getEnv(): RuntimeEnv {
  if (!cached) {
    cached = parseRuntimeEnv(process.env);
  }

  return cached;
}

export const env: RuntimeEnv = {
  get DATABASE_URL() {
    return getEnv().DATABASE_URL;
  },
};
