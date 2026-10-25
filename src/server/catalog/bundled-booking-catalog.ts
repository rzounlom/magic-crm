import raw from "../../../scripts/data/generations-booking/booking-catalog.json";
import { parseBookingCatalogDataset, type BookingCatalogDataset } from "@/server/catalog/dataset";

/** Bundled dataset so serverless runtimes do not depend on reading scripts/ from disk. */
export function loadBundledBookingCatalogDataset(): BookingCatalogDataset {
  return parseBookingCatalogDataset(raw);
}
