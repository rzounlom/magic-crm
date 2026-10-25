import "server-only";

import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db/create-client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function getClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  const client = createPrismaClient(env.DATABASE_URL);
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

/**
 * Lazy so Next.js page-data collection can import route modules without a
 * database URL. The first real query still requires a validated DATABASE_URL.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
