import type { PrismaClient } from "@/generated/prisma/client";
import { PERMISSION_CATALOG } from "@/types/permissions";

export async function syncPermissionDefinitions(database: PrismaClient): Promise<void> {
  const existing = await database.permissionDefinition.findMany({
    select: { key: true, module: true, name: true, description: true, active: true },
  });
  const existingByKey = new Map(existing.map((row) => [row.key, row]));
  const catalogKeys = new Set<string>(PERMISSION_CATALOG.map((entry) => entry.key));

  const toCreate = PERMISSION_CATALOG.filter((entry) => !existingByKey.has(entry.key));
  if (toCreate.length > 0) {
    await database.permissionDefinition.createMany({
      data: toCreate.map((entry) => ({
        key: entry.key,
        module: entry.module,
        name: entry.name,
        description: entry.description,
        active: true,
      })),
      skipDuplicates: true,
    });
  }

  for (const entry of PERMISSION_CATALOG) {
    const current = existingByKey.get(entry.key);
    if (!current) {
      continue;
    }
    if (
      current.module === entry.module &&
      current.name === entry.name &&
      current.description === entry.description &&
      current.active
    ) {
      continue;
    }
    await database.permissionDefinition.update({
      where: { key: entry.key },
      data: {
        module: entry.module,
        name: entry.name,
        description: entry.description,
        active: true,
      },
    });
  }

  const staleKeys = existing.map((row) => row.key).filter((key) => !catalogKeys.has(key));
  if (staleKeys.length > 0) {
    await database.permissionDefinition.updateMany({
      where: { key: { in: staleKeys } },
      data: { active: false },
    });
  }
}
