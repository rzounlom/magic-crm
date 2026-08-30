import { afterAll, afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { createLocationRepository } from "@/server/repositories/location-repository";
import { createUserProfileRepository } from "@/server/repositories/user-profile-repository";
import { resolveRequestContext } from "@/server/request-context";
import { provisionOrganization } from "@/server/services/provision-organization";
import { createTestPrismaClient } from "../helpers/test-database";

const db = createTestPrismaClient();
const createdOrganizationIds: string[] = [];

async function cleanup() {
  if (createdOrganizationIds.length === 0) {
    return;
  }

  await db.userProfile.deleteMany({
    where: { organizationId: { in: createdOrganizationIds } },
  });
  await db.location.deleteMany({
    where: { organizationId: { in: createdOrganizationIds } },
  });
  await db.organization.deleteMany({
    where: { id: { in: createdOrganizationIds } },
  });
  createdOrganizationIds.length = 0;
}

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("tenant isolation (postgres)", () => {
  it("cannot read another organization's location by guessed id", async () => {
    const orgA = await db.organization.create({
      data: {
        clerkOrganizationId: `clerk_org_a_${crypto.randomUUID()}`,
        name: "Org A",
        slug: `org-a-${crypto.randomUUID()}`,
        timezone: "UTC",
        currency: "USD",
      },
    });
    const orgB = await db.organization.create({
      data: {
        clerkOrganizationId: `clerk_org_b_${crypto.randomUUID()}`,
        name: "Org B",
        slug: `org-b-${crypto.randomUUID()}`,
        timezone: "UTC",
        currency: "USD",
      },
    });
    createdOrganizationIds.push(orgA.id, orgB.id);

    const locationA = await db.location.create({
      data: {
        organizationId: orgA.id,
        name: "Location A",
        slug: "main",
        timezone: "UTC",
        active: true,
      },
    });
    const locationB = await db.location.create({
      data: {
        organizationId: orgB.id,
        name: "Location B",
        slug: "main",
        timezone: "UTC",
        active: true,
      },
    });

    const repository = createLocationRepository(db);
    await expect(repository.findById({ organizationId: orgA.id }, locationB.id)).resolves.toBeNull();
    await expect(repository.findById({ organizationId: orgA.id }, locationA.id)).resolves.toMatchObject({
      id: locationA.id,
    });
  });

  it("cannot resolve a UserProfile membership from another organization", async () => {
    const orgA = await db.organization.create({
      data: {
        clerkOrganizationId: `clerk_org_a_${crypto.randomUUID()}`,
        name: "Org A",
        slug: `org-a-${crypto.randomUUID()}`,
        timezone: "UTC",
        currency: "USD",
      },
    });
    const orgB = await db.organization.create({
      data: {
        clerkOrganizationId: `clerk_org_b_${crypto.randomUUID()}`,
        name: "Org B",
        slug: `org-b-${crypto.randomUUID()}`,
        timezone: "UTC",
        currency: "USD",
      },
    });
    createdOrganizationIds.push(orgA.id, orgB.id);

    const profileA = await db.userProfile.create({
      data: {
        organizationId: orgA.id,
        clerkUserId: `user_${crypto.randomUUID()}`,
      },
    });

    const repository = createUserProfileRepository(db);
    await expect(repository.findById({ organizationId: orgB.id }, profileA.id)).resolves.toBeNull();
    await expect(repository.findByClerkUser({ organizationId: orgB.id }, profileA.clerkUserId)).resolves.toBeNull();
  });

  it("rejects a default location that belongs to another organization", async () => {
    const orgA = await db.organization.create({
      data: {
        clerkOrganizationId: `clerk_org_a_${crypto.randomUUID()}`,
        name: "Org A",
        slug: `org-a-${crypto.randomUUID()}`,
        timezone: "UTC",
        currency: "USD",
      },
    });
    const orgB = await db.organization.create({
      data: {
        clerkOrganizationId: `clerk_org_b_${crypto.randomUUID()}`,
        name: "Org B",
        slug: `org-b-${crypto.randomUUID()}`,
        timezone: "UTC",
        currency: "USD",
      },
    });
    createdOrganizationIds.push(orgA.id, orgB.id);

    const locationB = await db.location.create({
      data: {
        organizationId: orgB.id,
        name: "Location B",
        slug: "main",
        timezone: "UTC",
        active: true,
      },
    });

    await expect(
      db.userProfile.create({
        data: {
          organizationId: orgA.id,
          clerkUserId: `user_${crypto.randomUUID()}`,
          defaultLocationId: locationB.id,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("provisions an organization idempotently", async () => {
    const input = {
      clerkUserId: `user_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_${crypto.randomUUID()}`,
      organizationName: "Idempotent Org",
      organizationSlug: `idempotent-${crypto.randomUUID()}`,
    };

    const first = await provisionOrganization(input, db);
    createdOrganizationIds.push(first.organizationId);
    const second = await provisionOrganization(input, db);

    expect(second.organizationId).toBe(first.organizationId);
    expect(second.locationId).toBe(first.locationId);
    expect(second.userProfileId).toBe(first.userProfileId);

    await expect(
      db.organization.count({ where: { clerkOrganizationId: input.clerkOrganizationId } }),
    ).resolves.toBe(1);
    await expect(db.location.count({ where: { organizationId: first.organizationId } })).resolves.toBe(1);
    await expect(db.userProfile.count({ where: { organizationId: first.organizationId } })).resolves.toBe(1);
  });

  it("resolves different RequestContexts when the same Clerk user switches organizations", async () => {
    const clerkUserId = `user_${crypto.randomUUID()}`;
    const orgAInput = {
      clerkUserId,
      clerkOrganizationId: `clerk_org_a_${crypto.randomUUID()}`,
      organizationName: "Switch A",
      organizationSlug: `switch-a-${crypto.randomUUID()}`,
    };
    const orgBInput = {
      clerkUserId,
      clerkOrganizationId: `clerk_org_b_${crypto.randomUUID()}`,
      organizationName: "Switch B",
      organizationSlug: `switch-b-${crypto.randomUUID()}`,
    };

    const provisionedA = await provisionOrganization(orgAInput, db);
    const provisionedB = await provisionOrganization(orgBInput, db);
    createdOrganizationIds.push(provisionedA.organizationId, provisionedB.organizationId);

    const ctxA = await resolveRequestContext(
      {
        clerkUserId,
        clerkOrganizationId: orgAInput.clerkOrganizationId,
      },
      db,
    );
    const ctxB = await resolveRequestContext(
      {
        clerkUserId,
        clerkOrganizationId: orgBInput.clerkOrganizationId,
      },
      db,
    );

    expect(ctxA.organizationId).toBe(provisionedA.organizationId);
    expect(ctxB.organizationId).toBe(provisionedB.organizationId);
    expect(ctxA.organizationId).not.toBe(ctxB.organizationId);
    expect(ctxA.userId).not.toBe(ctxB.userId);
    expect(ctxA.clerkUserId).toBe(ctxB.clerkUserId);
  });

  it("does not create duplicates when provisioning races", async () => {
    const input = {
      clerkUserId: `user_${crypto.randomUUID()}`,
      clerkOrganizationId: `clerk_org_${crypto.randomUUID()}`,
      organizationName: "Race Org",
      organizationSlug: `race-${crypto.randomUUID()}`,
    };

    const [first, second] = await Promise.all([
      provisionOrganization(input, db),
      provisionOrganization(input, db),
    ]);
    createdOrganizationIds.push(first.organizationId, second.organizationId);

    expect(first.organizationId).toBe(second.organizationId);
    await expect(
      db.organization.count({ where: { clerkOrganizationId: input.clerkOrganizationId } }),
    ).resolves.toBe(1);
    await expect(db.location.count({ where: { organizationId: first.organizationId } })).resolves.toBe(1);
    await expect(db.userProfile.count({ where: { organizationId: first.organizationId } })).resolves.toBe(1);
  });
});
