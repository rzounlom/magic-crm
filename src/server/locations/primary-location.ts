import { PRIMARY_LOCATION_SLUG } from "@/server/services/provision-organization";

type LocationReader = {
  location: {
    findFirst(args: {
      where: { organizationId: string; active: boolean; slug?: string };
      orderBy?: { createdAt: "asc" };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

export async function resolvePrimaryLocationId(
  database: LocationReader,
  organizationId: string,
): Promise<string | null> {
  const main = await database.location.findFirst({
    where: { organizationId, active: true, slug: PRIMARY_LOCATION_SLUG },
    select: { id: true },
  });
  if (main) {
    return main.id;
  }
  const first = await database.location.findFirst({
    where: { organizationId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

export async function resolveInquiryLocationId(
  database: LocationReader,
  inquiry: { organizationId: string; locationId: string | null },
): Promise<string | null> {
  if (inquiry.locationId) {
    return inquiry.locationId;
  }
  return resolvePrimaryLocationId(database, inquiry.organizationId);
}
