import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}
