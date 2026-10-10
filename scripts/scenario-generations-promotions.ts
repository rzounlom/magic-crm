/**
 * Deterministic scenario pricing against persisted Generations CRM Test catalog (DEV).
 * Read-only. Does not create inquiries, bookings, or notifications.
 */
import { config } from "dotenv";

import { createPrismaClient } from "@/lib/db/create-client";
import { parseRuntimeEnv } from "@/lib/env/validation";
import { loadCatalogForProposal } from "@/server/catalog/load-for-proposal";
import { applyPackageInclusions } from "@/server/catalog/experience-coverage";
import { applyPromotions } from "@/server/catalog/promotions";
import { priceProduct } from "@/server/catalog/pricing";

const TARGET_SLUG = "generations-crm-test-1788129640704833684";

config({ quiet: true });
config({ path: ".env.local", override: true, quiet: true });

async function main() {
  if (process.env.MAGICCRM_DATABASE_ROLE === "test") {
    throw new Error("Refused: MAGICCRM_DATABASE_ROLE=test.");
  }
  const env = parseRuntimeEnv(process.env);
  const database = createPrismaClient(env.DATABASE_URL);
  try {
    const organization = await database.organization.findFirstOrThrow({
      where: { slug: TARGET_SLUG },
      select: { id: true, slug: true, timezone: true },
    });
    const location = await database.location.findFirst({
      where: { organizationId: organization.id },
      select: { id: true, timezone: true },
      orderBy: { createdAt: "asc" },
    });
    const catalog = await loadCatalogForProposal(database, organization.id, location?.id);
    const bySlug = new Map(catalog.products.map((row) => [row.slug, row]));
    const timeZone = location?.timezone ?? organization.timezone;

    const quoteProducts = (
      slugs: string[],
      guestCount: number,
      eventDate: string,
      startTime = "18:00",
    ) => {
      const selected = slugs.map((slug) => {
        const product = bySlug.get(slug);
        if (!product) {
          throw new Error(`Missing product ${slug}`);
        }
        return product;
      });
      const inclusion = applyPackageInclusions({ products: selected, guestCount });
      const context = {
        guestCount,
        eventDate,
        startTime,
        durationMinutes: 60,
        timeZone,
        organizationId: organization.id,
        locationId: location?.id ?? null,
        categorySlugByProductId: catalog.categorySlugByProductId,
      };
      const baseQuotes = inclusion.products.map((product) =>
        priceProduct(product, {
          ...context,
          guestCount: inclusion.guestCountByProductId[product.id] ?? guestCount,
        }),
      );
      const promoted = applyPromotions({
        quotes: baseQuotes,
        context,
        promotions: catalog.promotions,
      });
      return {
        omittedSlugs: selected
          .filter((row) => !inclusion.products.some((item) => item.id === row.id))
          .map((row) => row.slug),
        quotes: promoted.quotes.map((quote) => ({
          slug: quote.slug,
          totalCents: quote.totalCents,
          lineItems: quote.lineItems.map((line) => ({
            name: line.name,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            totalCents: line.totalCents,
            discountCents: line.discountCents ?? 0,
            originalTotalCents: line.originalTotalCents ?? line.totalCents,
          })),
        })),
        applied: promoted.applied,
        subtotalCents: promoted.quotes.reduce((sum, quote) => sum + quote.totalCents, 0),
      };
    };

    const wed = "2026-10-14"; // Wednesday
    const thu = "2026-10-15"; // Thursday
    const fri = "2026-10-16"; // Friday

    const scenarios = {
      wed_bowling_12: quoteProducts(["bowling-1h"], 12, wed),
      wed_bowling_axe_12: quoteProducts(["bowling-1h", "axe-throwing-30"], 12, wed),
      wed_axe_60: quoteProducts(["axe-throwing-60"], 12, wed),
      wed_bowling_food: quoteProducts(["bowling-1h", "pizza-pitcher-combo"], 12, wed),
      wed_package_have_a_ball: quoteProducts(["have-a-ball-bowling", "bowling-1h"], 12, wed),
      wed_play_card_laser_plex: quoteProducts(["laser-plex-card"], 12, wed),
      thu_axe_30_qty: [1, 2, 3, 4, 5].map((qty) => ({
        qty,
        ...quoteProducts(["axe-throwing-30"], qty, thu),
      })),
      thu_axe_60_excluded: quoteProducts(["axe-throwing-60"], 4, thu),
      thu_bowling_axe_laser_card: quoteProducts(
        ["bowling-1h", "axe-throwing-30", "laser-plex-card"],
        12,
        thu,
      ),
      fri_bowling: quoteProducts(["bowling-1h"], 6, fri),
      fri_bowling_food: quoteProducts(["bowling-1h", "pizza-pitcher-combo"], 6, fri),
      activePromotions: catalog.promotions
        .filter((row) => row.active)
        .map((row) => ({ slug: row.slug, type: row.type, productSlugs: row.productSlugs, daysOfWeek: row.daysOfWeek })),
      bowlingWeekendDays: bySlug.get("bowling-1h")?.prices.map((price) => ({
        strategy: price.strategy,
        weekendDays: price.weekendDays ?? null,
        weekdayAmountCents: price.weekdayAmountCents,
        weekendAmountCents: price.weekendAmountCents,
        shoeAddOnCents: price.shoeAddOnCents,
      })),
    };

    console.log(JSON.stringify(scenarios, null, 2));
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
