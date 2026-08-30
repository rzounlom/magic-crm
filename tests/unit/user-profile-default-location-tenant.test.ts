import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const compositeMigrationPath = path.resolve(
  process.cwd(),
  "prisma/migrations/20260830220000_user_profile_default_location_same_tenant/migration.sql",
);

const restrictMigrationPath = path.resolve(
  process.cwd(),
  "prisma/migrations/20260830221500_user_profile_default_location_restrict/migration.sql",
);

describe("UserProfile defaultLocation tenant invariant", () => {
  const compositeSql = readFileSync(compositeMigrationPath, "utf8");
  const restrictSql = readFileSync(restrictMigrationPath, "utf8");

  it("keeps a candidate unique key on Location (organizationId, id)", () => {
    expect(compositeSql).toMatch(
      /CREATE UNIQUE INDEX "locations_organizationId_id_key" ON "locations"\("organizationId", "id"\)/,
    );
  });

  it("keeps the composite tenant foreign key", () => {
    expect(compositeSql).toMatch(
      /FOREIGN KEY \("organizationId", "defaultLocationId"\) REFERENCES "locations"\("organizationId", "id"\)/,
    );
    expect(restrictSql).toMatch(
      /FOREIGN KEY \("organizationId", "defaultLocationId"\) REFERENCES "locations"\("organizationId", "id"\)/,
    );
  });

  it("uses ON DELETE RESTRICT so Prisma and PostgreSQL match", () => {
    expect(restrictSql).toMatch(/ON DELETE RESTRICT/);
    expect(restrictSql).not.toMatch(/ON DELETE SET NULL/);
    expect(restrictSql).not.toMatch(/ON DELETE CASCADE/);
  });

  it("prevents Tenant A from referencing Tenant B's location", () => {
    const compositeFk =
      /FOREIGN KEY \("organizationId", "defaultLocationId"\) REFERENCES "locations"\("organizationId", "id"\)/;

    expect(restrictSql).toMatch(compositeFk);
    expect(restrictSql).not.toMatch(
      /FOREIGN KEY \("defaultLocationId"\) REFERENCES "locations"\("id"\)/,
    );
  });
});
