import { readFileSync } from "node:fs";
import path from "node:path";

import {
  parseBookingCatalogDataset,
  type BookingCatalogDataset,
} from "@/server/catalog/dataset";

/** Explicit development import file for the named tenant. Not a MagicCRM runtime default. */
export const DEFAULT_BOOKING_CATALOG_DATASET_PATH = path.join(
  process.cwd(),
  "scripts/data/generations-booking/booking-catalog.json",
);

export function loadBookingCatalogDataset(
  filePath = DEFAULT_BOOKING_CATALOG_DATASET_PATH,
): BookingCatalogDataset {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return parseBookingCatalogDataset(raw);
}
