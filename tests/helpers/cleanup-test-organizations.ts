import type { PrismaClient } from "@/generated/prisma/client";

import { assertTestDatabaseClient } from "./test-database";

/** Cuid2 / uuid-ish ids created by fixtures — reject anything that is not safe for SQL IN lists. */
const SAFE_ORG_ID = /^[a-zA-Z0-9_-]{8,128}$/;

/**
 * Tables deleted in FK-safe order for fixture orgs only.
 * Kept as one server-side DO block so Neon HTTP RTT is paid once (~100ms)
 * instead of once per deleteMany (~40 round-trips).
 */
const CLEANUP_TABLES_BY_ORG_ID = [
  "communication_events",
  "booking_line_items",
  "resource_reservations",
  "operating_hours_staff_exceptions",
  "bookings",
  "organization_booking_sequences",
  "attraction_interest_products",
  "attraction_interests",
  "product_resource_requirements",
  "product_servings",
  "product_prices",
  "product_experience_grants",
  "pricing_promotions",
  "product_tax_classifications",
  "product_bundle_tax_policies",
  "tax_rate_schedules",
  "location_tax_profiles",
  "organization_tax_settings",
  "location_operating_hours_exceptions",
  "location_operating_hours_windows",
  "location_operating_hours_policies",
  "products",
  "product_categories",
  "recommendation_profiles",
  "knowledge_resource_requirements",
  "resources",
  "resource_types",
  "conversation_messages",
  "ai_usage",
  "event_plan_recommendations",
  "conversations",
  "inquiry_seen",
  "inquiries",
  "sales_knowledge_items",
  "team_invitation_security_groups",
  "team_invitations",
  "audit_logs",
  "security_groups",
  "user_profiles",
  "locations",
] as const;

export async function deleteTestOrganizations(
  database: PrismaClient,
  organizationIds: readonly string[],
): Promise<void> {
  assertTestDatabaseClient(database);
  if (organizationIds.length === 0) {
    return;
  }

  const ids = [...new Set(organizationIds)];
  for (const id of ids) {
    if (!SAFE_ORG_ID.test(id)) {
      throw new Error(`Cleanup refused: organization id failed safety check (${id.slice(0, 24)}…).`);
    }
  }

  const idList = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
  const deletes = CLEANUP_TABLES_BY_ORG_ID.map(
    (table) => `DELETE FROM "${table}" WHERE "organizationId" IN (${idList});`,
  ).join("\n  ");

  await database.$executeRawUnsafe(`
DO $magiccrm_test_cleanup$
BEGIN
  ${deletes}
  DELETE FROM "organizations" WHERE "id" IN (${idList});
END
$magiccrm_test_cleanup$;
`);
}
