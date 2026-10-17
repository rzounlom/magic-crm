import type { PrismaClient } from "@/generated/prisma/client";
import type { ScenarioLabEnabledConfig } from "@/lib/env/scenario-lab-config";
import { SYSTEM_GROUP_KEYS } from "@/server/authorization/default-security-groups";
import { resourceMetadata } from "@/server/resources/naming";
import { ScenarioLabError } from "@/server/scenario-lab/errors";
import {
  SCENARIO_LAB_SEED_CATEGORY_SLUG,
  SCENARIO_LAB_SEED_CURRENCY,
  SCENARIO_LAB_SEED_HOURS_NOTE,
  SCENARIO_LAB_SEED_LOCATION_NAME,
  SCENARIO_LAB_SEED_OFFERINGS,
  SCENARIO_LAB_SEED_ORG_NAME,
  SCENARIO_LAB_SEED_ORG_SLUG,
  SCENARIO_LAB_SEED_RESOURCE_NOTE,
  SCENARIO_LAB_SEED_TIMEZONE,
} from "@/server/scenario-lab/synthetic-venue-constants";
import { ensureDefaultSecurityGroups } from "@/server/services/ensure-default-security-groups";
import { PRIMARY_LOCATION_SLUG } from "@/server/services/provision-organization";
import { PRODUCT_AUDIENCES, PRODUCT_KINDS, PRODUCT_PRICE_STRATEGIES } from "@/types/catalog";
import { OPERATING_HOURS_VERIFICATION_STATUSES } from "@/types/operating-hours";
import { RESOURCE_QUANTITY_RULES, RESOURCE_SCHEDULING_MODES } from "@/types/resource-schedule";
import { ONBOARDING_STATUSES } from "@/types/team";

async function assessSeedVenueReadiness(database: PrismaClient, organizationId: string) {
  const organization = await database.organization.findFirst({
    where: { id: organizationId },
    select: { onboardingStatus: true, slug: true },
  });
  const requirements: string[] = [];
  if (!organization || organization.onboardingStatus !== ONBOARDING_STATUSES.ACTIVE) {
    requirements.push("Trusted organization must be ACTIVE.");
  }
  const location = await database.location.findFirst({
    where: { organizationId, active: true },
    select: { id: true },
  });
  if (!location) {
    requirements.push("Configure at least one active location.");
  }
  const attractionCount = await database.attractionInterest.count({
    where: { organizationId, active: true },
  });
  if (attractionCount < 1) {
    requirements.push("Publish at least one public attraction interest.");
  }
  return { ready: requirements.length === 0, requirements };
}

export type SeedPlanAction = "create" | "reuse" | "ensure";

export type SeedPlanItem = {
  entity: string;
  key: string;
  action: SeedPlanAction;
  detail: string;
};

export type SyntheticVenueSeedPlan = {
  organizationSlug: string;
  trustedClerkOrganizationId: string;
  allowlistedClerkUserIds: readonly [string, string];
  items: SeedPlanItem[];
};

export type SyntheticVenueSeedResult = {
  plan: SyntheticVenueSeedPlan;
  organizationId: string;
  locationId: string;
  staffProfileIds: readonly [string, string];
  attractionInterestIds: string[];
  venueReady: boolean;
  venueRequirements: string[];
  applied: boolean;
};

type SeedMode = "dry-run" | "apply";

function planItem(
  entity: string,
  key: string,
  action: SeedPlanAction,
  detail: string,
): SeedPlanItem {
  return { entity, key, action, detail };
}

/**
 * Build an idempotent seed plan against the active database (read-only).
 * Does not create customers, inquiries, bookings, or scenario runs.
 */
export async function planSyntheticVenueSeed(
  database: PrismaClient,
  config: ScenarioLabEnabledConfig,
): Promise<SyntheticVenueSeedPlan> {
  const items: SeedPlanItem[] = [];
  const clerkOrgId = config.trustedClerkOrganizationId;
  const [userA, userB] = config.allowedClerkUserIds;

  const existingOrg = await database.organization.findFirst({
    where: { clerkOrganizationId: clerkOrgId },
    select: { id: true, slug: true, name: true, onboardingStatus: true },
  });

  if (existingOrg) {
    items.push(
      planItem(
        "organization",
        clerkOrgId,
        "reuse",
        `Reuse org id=${existingOrg.id} slug=${existingOrg.slug} (ensure ACTIVE + TEST name if still seed-owned)`,
      ),
    );
  } else {
    const slugTaken = await database.organization.findFirst({
      where: { slug: SCENARIO_LAB_SEED_ORG_SLUG },
      select: { id: true, clerkOrganizationId: true },
    });
    if (slugTaken && slugTaken.clerkOrganizationId !== clerkOrgId) {
      throw new ScenarioLabError(
        "INVALID_INPUT",
        `Organization slug "${SCENARIO_LAB_SEED_ORG_SLUG}" is owned by a different Clerk org; refusing to overwrite.`,
      );
    }
    items.push(
      planItem(
        "organization",
        SCENARIO_LAB_SEED_ORG_SLUG,
        "create",
        `Create ${SCENARIO_LAB_SEED_ORG_NAME} mapped to ${clerkOrgId}`,
      ),
    );
  }

  items.push(
    planItem(
      "location",
      PRIMARY_LOCATION_SLUG,
      existingOrg ? "ensure" : "create",
      `${SCENARIO_LAB_SEED_LOCATION_NAME} (slug=${PRIMARY_LOCATION_SLUG}, tz=${SCENARIO_LAB_SEED_TIMEZONE})`,
    ),
  );

  items.push(
    planItem(
      "security",
      "default-groups",
      "ensure",
      "Permission definitions + default system security groups",
    ),
  );

  for (const clerkUserId of [userA, userB]) {
    const profile = existingOrg
      ? await database.userProfile.findFirst({
          where: { organizationId: existingOrg.id, clerkUserId },
          select: { id: true },
        })
      : null;
    items.push(
      planItem(
        "user_profile",
        clerkUserId,
        profile ? "reuse" : "create",
        profile
          ? `Staff profile ${profile.id} → Administrators`
          : `Staff profile for ${clerkUserId} → Administrators`,
      ),
    );
  }

  items.push(
    planItem(
      "product_category",
      SCENARIO_LAB_SEED_CATEGORY_SLUG,
      "ensure",
      "TEST entertainment category",
    ),
  );

  for (const offering of SCENARIO_LAB_SEED_OFFERINGS) {
    items.push(
      planItem(
        "catalog_offering",
        offering.productSlug,
        "ensure",
        `${offering.productName} + interest + ${offering.units}× ${offering.resourceTypeName} @ ${offering.amountCents}¢`,
      ),
    );
  }

  items.push(
    planItem(
      "operating_hours",
      "weekly",
      "ensure",
      `Sun–Sat 10:00–20:00 local VERIFIED (${SCENARIO_LAB_SEED_HOURS_NOTE})`,
    ),
  );

  return {
    organizationSlug: SCENARIO_LAB_SEED_ORG_SLUG,
    trustedClerkOrganizationId: clerkOrgId,
    allowlistedClerkUserIds: config.allowedClerkUserIds,
    items,
  };
}

/**
 * Apply the synthetic venue seed. Idempotent; never deletes scenario runs or
 * operator-owned rows outside managed lab-* catalog slugs / seed org mapping.
 */
export async function applySyntheticVenueSeed(
  database: PrismaClient,
  config: ScenarioLabEnabledConfig,
): Promise<SyntheticVenueSeedResult> {
  return runSyntheticVenueSeed(database, config, "apply");
}

export async function dryRunSyntheticVenueSeed(
  database: PrismaClient,
  config: ScenarioLabEnabledConfig,
): Promise<SyntheticVenueSeedResult> {
  return runSyntheticVenueSeed(database, config, "dry-run");
}

async function runSyntheticVenueSeed(
  database: PrismaClient,
  config: ScenarioLabEnabledConfig,
  mode: SeedMode,
): Promise<SyntheticVenueSeedResult> {
  const plan = await planSyntheticVenueSeed(database, config);

  if (mode === "dry-run") {
    return {
      plan,
      organizationId: "",
      locationId: "",
      staffProfileIds: ["", ""],
      attractionInterestIds: [],
      venueReady: false,
      venueRequirements: ["dry-run — no writes performed"],
      applied: false,
    };
  }

  const clerkOrgId = config.trustedClerkOrganizationId;
  const [userA, userB] = config.allowedClerkUserIds;

  let organization = await database.organization.findFirst({
    where: { clerkOrganizationId: clerkOrgId },
  });

  if (!organization) {
    const slugConflict = await database.organization.findFirst({
      where: { slug: SCENARIO_LAB_SEED_ORG_SLUG },
    });
    if (slugConflict) {
      throw new ScenarioLabError(
        "INVALID_INPUT",
        `Organization slug "${SCENARIO_LAB_SEED_ORG_SLUG}" already exists for another tenant.`,
      );
    }
    organization = await database.organization.create({
      data: {
        clerkOrganizationId: clerkOrgId,
        name: SCENARIO_LAB_SEED_ORG_NAME,
        slug: SCENARIO_LAB_SEED_ORG_SLUG,
        timezone: SCENARIO_LAB_SEED_TIMEZONE,
        currency: SCENARIO_LAB_SEED_CURRENCY,
        onboardingStatus: ONBOARDING_STATUSES.ACTIVE,
        depositPercent: 30,
      },
    });
  } else {
    const updates: {
      onboardingStatus?: string;
      name?: string;
      timezone?: string;
      currency?: string;
    } = {};
    if (organization.onboardingStatus !== ONBOARDING_STATUSES.ACTIVE) {
      updates.onboardingStatus = ONBOARDING_STATUSES.ACTIVE;
    }
    // Only rename when still the seed slug / seed name family — never overwrite unrelated operators.
    if (
      organization.slug === SCENARIO_LAB_SEED_ORG_SLUG &&
      (organization.name === SCENARIO_LAB_SEED_ORG_NAME ||
        organization.name.startsWith("MagicCRM Scenario Lab"))
    ) {
      if (organization.name !== SCENARIO_LAB_SEED_ORG_NAME) {
        updates.name = SCENARIO_LAB_SEED_ORG_NAME;
      }
    }
    if (!organization.timezone) {
      updates.timezone = SCENARIO_LAB_SEED_TIMEZONE;
    }
    if (!organization.currency) {
      updates.currency = SCENARIO_LAB_SEED_CURRENCY;
    }
    if (Object.keys(updates).length > 0) {
      organization = await database.organization.update({
        where: { id: organization.id },
        data: updates,
      });
    }
  }

  let location = await database.location.findFirst({
    where: { organizationId: organization.id, slug: PRIMARY_LOCATION_SLUG },
  });
  if (!location) {
    location = await database.location.create({
      data: {
        organizationId: organization.id,
        name: SCENARIO_LAB_SEED_LOCATION_NAME,
        slug: PRIMARY_LOCATION_SLUG,
        timezone: organization.timezone || SCENARIO_LAB_SEED_TIMEZONE,
        active: true,
      },
    });
  } else {
    const locationUpdates: { name?: string; active?: boolean; timezone?: string } = {};
    if (!location.active) {
      locationUpdates.active = true;
    }
    if (
      location.name === SCENARIO_LAB_SEED_LOCATION_NAME ||
      location.name === "Main Location" ||
      location.name.startsWith("MagicCRM Scenario Lab")
    ) {
      if (location.name !== SCENARIO_LAB_SEED_LOCATION_NAME) {
        locationUpdates.name = SCENARIO_LAB_SEED_LOCATION_NAME;
      }
    }
    if (!location.timezone) {
      locationUpdates.timezone = organization.timezone || SCENARIO_LAB_SEED_TIMEZONE;
    }
    if (Object.keys(locationUpdates).length > 0) {
      location = await database.location.update({
        where: { id: location.id },
        data: locationUpdates,
      });
    }
  }

  const firstProfilePlaceholder = await ensureStaffProfile(database, {
    organizationId: organization.id,
    clerkUserId: userA,
    defaultLocationId: location.id,
  });

  await ensureDefaultSecurityGroups(database, {
    organizationId: organization.id,
    userProfileId: firstProfilePlaceholder.id,
    organizationCreated: false,
    isClerkOrganizationAdmin: true,
  });

  const profileA = firstProfilePlaceholder;
  const profileB = await ensureStaffProfile(database, {
    organizationId: organization.id,
    clerkUserId: userB,
    defaultLocationId: location.id,
  });

  await ensureAdministratorMembership(database, {
    organizationId: organization.id,
    userProfileId: profileA.id,
  });
  await ensureAdministratorMembership(database, {
    organizationId: organization.id,
    userProfileId: profileB.id,
  });

  const category = await ensureCategory(database, organization.id);
  const attractionInterestIds: string[] = [];

  for (const offering of SCENARIO_LAB_SEED_OFFERINGS) {
    const interestId = await ensureOffering(database, {
      organizationId: organization.id,
      locationId: location.id,
      categoryId: category.id,
      offering,
    });
    attractionInterestIds.push(interestId);
  }

  await ensureOperatingHours(database, {
    organizationId: organization.id,
    locationId: location.id,
  });

  const venue = await assessSeedVenueReadiness(database, organization.id);

  return {
    plan,
    organizationId: organization.id,
    locationId: location.id,
    staffProfileIds: [profileA.id, profileB.id],
    attractionInterestIds,
    venueReady: venue.ready,
    venueRequirements: venue.requirements,
    applied: true,
  };
}

async function ensureStaffProfile(
  database: PrismaClient,
  input: { organizationId: string; clerkUserId: string; defaultLocationId: string },
) {
  const existing = await database.userProfile.findFirst({
    where: {
      organizationId: input.organizationId,
      clerkUserId: input.clerkUserId,
    },
  });
  if (existing) {
    if (!existing.defaultLocationId) {
      return database.userProfile.update({
        where: { id: existing.id },
        data: { defaultLocationId: input.defaultLocationId },
      });
    }
    return existing;
  }
  return database.userProfile.create({
    data: {
      organizationId: input.organizationId,
      clerkUserId: input.clerkUserId,
      defaultLocationId: input.defaultLocationId,
    },
  });
}

async function ensureAdministratorMembership(
  database: PrismaClient,
  input: { organizationId: string; userProfileId: string },
) {
  const administrators = await database.securityGroup.findFirst({
    where: {
      organizationId: input.organizationId,
      systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS,
    },
    select: { id: true },
  });
  if (!administrators) {
    throw new ScenarioLabError(
      "INVALID_INPUT",
      "Administrators security group missing after ensureDefaultSecurityGroups",
    );
  }

  await database.securityGroupMember.upsert({
    where: {
      securityGroupId_userProfileId: {
        securityGroupId: administrators.id,
        userProfileId: input.userProfileId,
      },
    },
    create: {
      organizationId: input.organizationId,
      securityGroupId: administrators.id,
      userProfileId: input.userProfileId,
    },
    update: {},
  });
}

async function ensureCategory(database: PrismaClient, organizationId: string) {
  const existing = await database.productCategory.findFirst({
    where: { organizationId, slug: SCENARIO_LAB_SEED_CATEGORY_SLUG },
  });
  if (existing) {
    return existing;
  }
  return database.productCategory.create({
    data: {
      organizationId,
      slug: SCENARIO_LAB_SEED_CATEGORY_SLUG,
      name: "TEST Entertainment",
      sortOrder: 10,
    },
  });
}

async function ensureOffering(
  database: PrismaClient,
  input: {
    organizationId: string;
    locationId: string;
    categoryId: string;
    offering: (typeof SCENARIO_LAB_SEED_OFFERINGS)[number];
  },
): Promise<string> {
  const { organizationId, locationId, categoryId, offering } = input;

  let product = await database.product.findFirst({
    where: { organizationId, slug: offering.productSlug },
  });
  if (!product) {
    product = await database.product.create({
      data: {
        organizationId,
        locationId,
        categoryId,
        slug: offering.productSlug,
        name: offering.productName,
        kind: offering.kind === "RENTAL" ? PRODUCT_KINDS.RENTAL : PRODUCT_KINDS.ATTRACTION,
        audience: PRODUCT_AUDIENCES.ALL,
        shortDescription: `${offering.productName} — Scenario Lab TEST synthetic offering. Not a real venue product.`,
        durationMinutes: offering.durationMinutes,
        minGuests: 1,
        maxGuests: offering.capacity * offering.units,
        active: true,
        sortOrder: offering.sortOrder,
      },
    });
  } else if (!product.active) {
    product = await database.product.update({
      where: { id: product.id },
      data: { active: true },
    });
  }

  const existingPrice = await database.productPrice.findFirst({
    where: { organizationId, productId: product.id, active: true },
  });
  if (!existingPrice) {
    await database.productPrice.create({
      data: {
        organizationId,
        productId: product.id,
        strategy:
          offering.priceStrategy === "FIXED_RENTAL"
            ? PRODUCT_PRICE_STRATEGIES.FIXED_RENTAL
            : PRODUCT_PRICE_STRATEGIES.PER_PERSON,
        amountCents: offering.amountCents,
        unitLabel: offering.priceStrategy === "FIXED_RENTAL" ? "room" : "guest",
        active: true,
      },
    });
  }

  let resourceType = await database.resourceType.findFirst({
    where: { organizationId, slug: offering.resourceTypeSlug },
  });
  if (!resourceType) {
    resourceType = await database.resourceType.create({
      data: {
        organizationId,
        locationId,
        name: offering.resourceTypeName,
        slug: offering.resourceTypeSlug,
        schedulingMode: RESOURCE_SCHEDULING_MODES.SLOTTED,
        slotMinutes: 30,
        defaultDurationMinutes: offering.durationMinutes,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        inventoryConfigured: false,
        active: true,
      },
    });
  }

  const existingUnits = await database.resource.count({
    where: {
      organizationId,
      resourceTypeId: resourceType.id,
      active: true,
    },
  });
  if (existingUnits < offering.units) {
    for (let n = existingUnits + 1; n <= offering.units; n += 1) {
      await database.resource.create({
        data: {
          organizationId,
          locationId,
          resourceTypeId: resourceType.id,
          name: `${offering.unitPrefix} ${n}`,
          displayOrder: n,
          capacity: offering.capacity,
          active: true,
          metadata: resourceMetadata({
            notes: SCENARIO_LAB_SEED_RESOURCE_NOTE,
            capacityKind: "per_unit",
          }),
        },
      });
    }
  }

  if (!resourceType.inventoryConfigured || !resourceType.active) {
    resourceType = await database.resourceType.update({
      where: { id: resourceType.id },
      data: { inventoryConfigured: true, active: true, locationId },
    });
  }

  const requirement = await database.productResourceRequirement.findFirst({
    where: {
      organizationId,
      productId: product.id,
      resourceTypeId: resourceType.id,
    },
  });
  if (!requirement) {
    await database.productResourceRequirement.create({
      data: {
        organizationId,
        productId: product.id,
        resourceTypeId: resourceType.id,
        quantityRule: RESOURCE_QUANTITY_RULES.FIXED,
        quantity: 1,
        durationMinutes: offering.durationMinutes,
        exclusive: offering.kind === "RENTAL",
      },
    });
  }

  let interest = await database.attractionInterest.findFirst({
    where: { organizationId, slug: offering.interestSlug },
  });
  if (!interest) {
    interest = await database.attractionInterest.create({
      data: {
        organizationId,
        slug: offering.interestSlug,
        label: offering.interestLabel,
        description: "Scenario Lab TEST synthetic attraction interest.",
        active: true,
        displayOrder: offering.sortOrder,
      },
    });
  } else if (!interest.active) {
    interest = await database.attractionInterest.update({
      where: { id: interest.id },
      data: { active: true },
    });
  }

  const link = await database.attractionInterestProduct.findFirst({
    where: {
      organizationId,
      attractionInterestId: interest.id,
      productId: product.id,
    },
  });
  if (!link) {
    await database.attractionInterestProduct.create({
      data: {
        organizationId,
        attractionInterestId: interest.id,
        productId: product.id,
        sortOrder: 0,
      },
    });
  }

  return interest.id;
}

async function ensureOperatingHours(
  database: PrismaClient,
  input: { organizationId: string; locationId: string },
) {
  const policy = await database.locationOperatingHoursPolicy.upsert({
    where: {
      organizationId_locationId: {
        organizationId: input.organizationId,
        locationId: input.locationId,
      },
    },
    update: {
      verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
      approvedAt: new Date(),
      approvedByNote: SCENARIO_LAB_SEED_HOURS_NOTE,
    },
    create: {
      organizationId: input.organizationId,
      locationId: input.locationId,
      verificationStatus: OPERATING_HOURS_VERIFICATION_STATUSES.VERIFIED,
      approvedAt: new Date(),
      approvedByNote: SCENARIO_LAB_SEED_HOURS_NOTE,
    },
  });

  const windowCount = await database.locationOperatingHoursWindow.count({
    where: { organizationId: input.organizationId, policyId: policy.id },
  });
  if (windowCount === 0) {
    await database.locationOperatingHoursWindow.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        organizationId: input.organizationId,
        locationId: input.locationId,
        policyId: policy.id,
        dayOfWeek,
        startMinute: 10 * 60,
        endMinute: 20 * 60,
      })),
    });
  }
}
