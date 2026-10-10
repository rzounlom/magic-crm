import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { catalogPriceFromRow, priceProduct } from "@/server/catalog/pricing";

const TARGET_SLUG = "generations-crm-test-1788129640704833684";

config();
config({ path: ".env.local", override: true });

async function main() {
  const env = parseRuntimeEnv(process.env);
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const org = await db.organization.findFirstOrThrow({
      where: { slug: TARGET_SLUG },
      select: { id: true },
    });
    const other = await db.organization.findFirst({
      where: { slug: { not: TARGET_SLUG }, products: { some: { slug: "bowling-1h" } } },
      select: { id: true, slug: true },
    });
    const product = await db.product.findFirstOrThrow({
      where: { organizationId: org.id, slug: "bowling-1h" },
      include: { prices: { where: { active: true } } },
    });
    const toInput = (row: typeof product) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      audience: row.audience,
      durationMinutes: row.durationMinutes,
      minGuests: row.minGuests,
      maxGuests: row.maxGuests,
      weekendOnly: row.weekendOnly,
      fulfillmentGroup: row.fulfillmentGroup,
      prices: row.prices.map(catalogPriceFromRow),
      serving: null,
      guestsPerUnit: 6,
    });
    const input = toInput(product);
    const fri = priceProduct(input, {
      guestCount: 6,
      eventDate: "2026-10-16",
      startTime: "18:00",
      durationMinutes: 60,
    });
    const thu = priceProduct(input, {
      guestCount: 6,
      eventDate: "2026-10-15",
      startTime: "18:00",
      durationMinutes: 60,
    });
    let otherFriday: number | null = null;
    let otherWeekendDays: unknown = null;
    if (other) {
      const otherProduct = await db.product.findFirst({
        where: { organizationId: other.id, slug: "bowling-1h" },
        include: { prices: { where: { active: true } } },
      });
      if (otherProduct) {
        otherFriday = priceProduct(toInput(otherProduct), {
          guestCount: 6,
          eventDate: "2026-10-16",
          startTime: "18:00",
          durationMinutes: 60,
        }).totalCents;
        otherWeekendDays = otherProduct.prices.find((row) => row.strategy === "PER_LANE_WEEKDAY_WEEKEND")?.weekendDays ?? null;
      }
    }
    console.log(
      JSON.stringify(
        {
          fridayTotalCents: fri.totalCents,
          thursdayTotalCents: thu.totalCents,
          weekendDays: product.prices.find((row) => row.strategy === "PER_LANE_WEEKDAY_WEEKEND")?.weekendDays,
          otherOrgSlug: other?.slug ?? null,
          otherFridayTotalCents: otherFriday,
          otherWeekendDays,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
