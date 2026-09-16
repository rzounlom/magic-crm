import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("database migration scripts", () => {
  it("applies committed migrations to development and the isolated test database", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const wrapper = readFileSync(path.join(process.cwd(), "scripts/apply-migrations.mjs"), "utf8");

    expect(pkg.scripts["db:migrate"]).toBe("node scripts/apply-migrations.mjs dev");
    expect(pkg.scripts["db:deploy"]).toBe("node scripts/apply-migrations.mjs deploy");
    expect(wrapper).toContain("migrate");
    expect(wrapper).toContain("runWithTestEnv");
    expect(wrapper).toContain('prisma", "migrate", "deploy"');
    expect(wrapper).not.toMatch(/migrate reset/);
  });
});
