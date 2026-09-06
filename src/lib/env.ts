import "server-only";

import { parseRuntimeEnv, type RuntimeEnv } from "@/lib/env/validation";

export type { RuntimeEnv } from "@/lib/env/validation";
export {
  EnvValidationError,
  parsePrismaCliEnv,
  parseRuntimeEnv,
  parseTestDatabaseEnv,
} from "@/lib/env/validation";

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
  get APP_URL() {
    return getEnv().APP_URL;
  },
  get CLERK_SECRET_KEY() {
    return getEnv().CLERK_SECRET_KEY;
  },
  get NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY() {
    return getEnv().NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  },
};
