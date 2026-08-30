import "server-only";

import type { TrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { readTrustedClerkAuth } from "@/lib/auth/trusted-clerk-auth";
import { db } from "@/lib/db";
import {
  resolveRequestContext,
  type RequestContext,
  type RequestContextDatabase,
} from "@/server/request-context";

export async function getRequestContext(options: {
  auth?: TrustedClerkAuth;
  database?: RequestContextDatabase;
} = {}): Promise<RequestContext> {
  const trusted = options.auth ?? (await readTrustedClerkAuth());
  return resolveRequestContext(trusted, options.database ?? db);
}
