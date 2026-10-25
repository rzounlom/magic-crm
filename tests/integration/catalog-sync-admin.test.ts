import { afterAll, afterEach, describe, expect, it } from "vitest";

import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { AuthorizationError, CatalogSyncError } from "@/server/errors";
import { resolveRequestContext } from "@/server/request-context";
import { loadBookingCatalogDataset } from "@/server/catalog/load-dataset";
import { applyCatalogSync, previewCatalogSync } from "@/server/services/catalog-sync-admin-service";
import { provisionOrganization } from "@/server/services/provision-organization";
import { TENANT_BETA_DATASET } from "../fixtures/tenant-alpha-beta-catalogs";
import { deleteTestOrganizations } from "../helpers/cleanup-test-organizations";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

afterEach(async () => {
  await deleteTestOrganizations(db, createdOrganizationIds);
  createdOrganizationIds.length = 0;
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
});

async function provision(label: string, name: string, slugPrefix: string) {
  const result = await provisionOrganization(
    {
      clerkUserId: `user_csync_${label}_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_csync_${label}_${crypto.randomUUID()}`,
      organizationName: name,
      organizationSlug: `${slugPrefix}-${crypto.randomUUID()}`,
      isClerkOrganizationAdmin: true,
    },
    db,
  );
  createdOrganizationIds.push(result.organizationId);
  const organization = await db.organization.findFirstOrThrow({ where: { id: result.organizationId } });
  const profile = await db.userProfile.findFirstOrThrow({ where: { id: result.userProfileId } });
  const ctx = await resolveRequestContext(
    {
      clerkUserId: profile.clerkUserId,
      clerkOrganizationId: organization.clerkOrganizationId,
    },
    db,
  );
  return { ...result, ctx, organization, profile };
}

describe("catalog sync admin (postgres)", () => {
  it("previews without writing, refuses non-Generations tenants, and applies only after confirmation", async () => {
    const generations = await provision("gen", "Generations Adventureplex", "generations-adventureplex");
    const other = await provision("other", "Independent Fun Center", "independent-fun");
    const dataset = loadBookingCatalogDataset();

    const dryRun = await previewCatalogSync(generations.ctx, db, dataset);
    expect(dryRun.eligible).toBe(true);
    expect(dryRun.diff.products.created.length).toBeGreaterThan(0);
    expect(await db.product.count({ where: { organizationId: generations.organization.id } })).toBe(0);

    const refused = await previewCatalogSync(other.ctx, db, dataset);
    expect(refused.eligible).toBe(false);
    await expect(applyCatalogSync(other.ctx, db, refused.confirmationPhrase, dataset)).rejects.toBeInstanceOf(
      CatalogSyncError,
    );

    await expect(applyCatalogSync(generations.ctx, db, "IMPORT", dataset)).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
    });
    expect(await db.product.count({ where: { organizationId: generations.organization.id } })).toBe(0);

    const applied = await applyCatalogSync(generations.ctx, db, dryRun.confirmationPhrase, dataset);
    expect(applied.organization.productCount).toBeGreaterThan(0);
    expect(await db.product.count({ where: { organizationId: other.organization.id } })).toBe(0);
    expect(
      await db.product.findFirst({
        where: { organizationId: generations.organization.id, slug: "pizza-pitcher-combo" },
      }),
    ).not.toBeNull();
  }, 90_000);

  it("forbids staff without catalog.manage and ignores a foreign confirmation slug", async () => {
    const generations = await provision("perm", "Generations Adventureplex", "generations-perm");
    const frontDesk = await db.securityGroup.findFirstOrThrow({
      where: { organizationId: generations.organization.id, systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK },
    });
    const clerkUserId = `user_front_${crypto.randomUUID()}`;
    const profile = await db.userProfile.create({
      data: {
        organizationId: generations.organization.id,
        clerkUserId,
        defaultLocationId: generations.locationId,
        email: `${clerkUserId}@example.com`,
      },
    });
    await db.securityGroupMember.create({
      data: {
        organizationId: generations.organization.id,
        securityGroupId: frontDesk.id,
        userProfileId: profile.id,
      },
    });
    const frontCtx = await resolveRequestContext(
      {
        clerkUserId,
        clerkOrganizationId: generations.organization.clerkOrganizationId,
      },
      db,
    );
    await expect(previewCatalogSync(frontCtx, db, TENANT_BETA_DATASET)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      applyCatalogSync(generations.ctx, db, "IMPORT someone-else", loadBookingCatalogDataset()),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
  }, 60_000);
});
