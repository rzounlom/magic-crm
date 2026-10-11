#!/usr/bin/env node
import { config } from "dotenv";
import { createPrismaClient } from "../src/lib/db/create-client.ts";
import { parseRuntimeEnv } from "../src/lib/env/validation.ts";

config();
config({ path: ".env.local", override: true });

const env = parseRuntimeEnv(process.env);
const host = new URL(env.DATABASE_URL).hostname;
const db = createPrismaClient(env.DATABASE_URL);
const slug = process.env.PLAYWRIGHT_STAFF_ORG_SLUG ?? "magiccrm-test-center-b";

const org = await db.organization.findFirst({
  where: { slug },
  include: { locations: true },
});
if (!org) {
  console.log(JSON.stringify({ ok: false, reason: "org missing", slug, host }));
  process.exit(1);
}
const loc = org.locations[0] ?? null;
const policy = loc
  ? await db.locationOperatingHoursPolicy.findFirst({
      where: { organizationId: org.id, locationId: loc.id },
      include: { weeklyWindows: true },
    })
  : null;
const types = await db.resourceType.findMany({
  where: { organizationId: org.id },
  include: {
    _count: { select: { resources: true } },
    requirements: { include: { salesKnowledgeItem: { select: { name: true } } } },
  },
});
const knowledge = await db.salesKnowledgeItem.findMany({
  where: { organizationId: org.id, active: true },
  select: { id: true, name: true, type: true, durationMinutes: true },
});

console.log(
  JSON.stringify(
    {
      ok: true,
      host,
      org: { id: org.id, slug: org.slug, timezone: org.timezone },
      location: loc ? { id: loc.id, name: loc.name, timezone: loc.timezone } : null,
      policy: policy
        ? {
            verificationStatus: policy.verificationStatus,
            approvedByNote: policy.approvedByNote,
            windowCount: policy.weeklyWindows.length,
          }
        : null,
      resourceTypes: types.map((t) => ({
        name: t.name,
        slug: t.slug,
        inventoryConfigured: t.inventoryConfigured,
        resources: t._count.resources,
        linked: t.requirements.map((r) => r.salesKnowledgeItem.name),
      })),
      knowledge,
    },
    null,
    2,
  ),
);
await db.$disconnect();
