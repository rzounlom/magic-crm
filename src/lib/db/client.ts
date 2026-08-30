import "server-only";

import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db/create-client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const db = globalForPrisma.prisma ?? createPrismaClient(env.DATABASE_URL);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
