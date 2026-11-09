import { describe, expect, it } from "vitest";

import {
  WP_CATALOG_VERSION,
  applyWpCatalogOverrides,
  recommendWpParity,
  sampleWpInquiry,
  snapshotWpParityResult,
  wpCatalogDefaults,
  wpCatalogRevision,
} from "@/server/event-planner/wp-parity";

describe("wp parity catalog + snapshot", () => {
  it("pins the plugin catalog version and a stable 12-hex revision", () => {
    expect(WP_CATALOG_VERSION).toBe("2026-11-02");
    const revision = wpCatalogRevision(wpCatalogDefaults());
    expect(revision).toMatch(/^[a-f0-9]{12}$/);
    expect(wpCatalogRevision(wpCatalogDefaults())).toBe(revision);
  });

  it("applies only valid integer-cent overrides without mutating defaults", () => {
    const next = applyWpCatalogOverrides({
      "bowling.shoes": 400,
      "axe.hour": -1,
      "laser.pass": 25.5,
      climb: 600,
      unknown: 1,
    });
    expect(next.bowling.shoes).toBe(400);
    expect(next.axe.hour).toBe(3000);
    expect(next.laser.pass).toBe(2500);
    expect(next.climb).toBe(600);
    expect(wpCatalogDefaults().bowling.shoes).toBe(350);
    expect(wpCatalogRevision(next)).not.toBe(wpCatalogRevision(wpCatalogDefaults()));
  });

  it("builds a JSON-safe staff snapshot labeled plugin_defaults without contact details", () => {
    const sample = sampleWpInquiry();
    sample.attractions.bowling = "yes";
    sample.adults = 6;
    const snapshot = snapshotWpParityResult(recommendWpParity(sample, { bowling_hours: 1 }));
    expect(snapshot.valid).toBe(true);
    if (!snapshot.valid) return;
    expect(snapshot.pricing_source).toBe("plugin_defaults");
    expect(snapshot.rules_version).toBe(WP_CATALOG_VERSION);
    expect(snapshot.pricing_revision).toBe(wpCatalogRevision(wpCatalogDefaults()));
    expect(snapshot.dates[0]?.recommendation.total_cents).toBe(6100);
    const json = JSON.stringify(snapshot);
    expect(JSON.parse(json)).toEqual(snapshot);
    expect(json).not.toContain("sample@example.com");
    expect(json).not.toContain("574-555-0100");
  });

  it("snapshots validation failures", () => {
    const sample = sampleWpInquiry();
    sample.email = "nope";
    const snapshot = snapshotWpParityResult(recommendWpParity(sample));
    expect(snapshot.valid).toBe(false);
  });
});
