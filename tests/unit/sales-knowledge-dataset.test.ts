import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { salesAgentInstructions } from "@/server/ai/sales-agent-instructions";
import {
  locationPrefix,
  mapSalesKnowledgeRecord,
  parseSalesKnowledgeDataset,
  SalesKnowledgeDatasetError,
} from "@/server/sales-knowledge/dataset";
import { loadSalesKnowledgeDatasetFromDirectory } from "@/server/sales-knowledge/load-dataset-files";
import { salesKnowledgeSearchTerms } from "@/server/services/sales-knowledge-service";
import { SALES_KNOWLEDGE_TYPES } from "@/types/inquiry";

const validRecord = {
  type: SALES_KNOWLEDGE_TYPES.ATTRACTION,
  name: "Go-Kart Racing",
  shortDescription: "Indoor racing",
  details: "Electric go-karts.",
  priceText: "$12/person per race.",
  durationMinutes: null,
  minGuests: 1,
  maxGuests: null,
  waiverRequired: true,
  active: true,
  customerFacingNotes: "Ages 8+.",
  salesNotes: "Ask ages first.",
  locationLabel: "Generations Raceway",
  sourceUrl: "https://example.test/raceway",
};

describe("sales knowledge dataset parser", () => {
  it("maps location context and ignores source URLs", () => {
    const parsed = parseSalesKnowledgeDataset({
      knowledge: [validRecord],
      needsVerification: [{ topic: "hours", status: "VERIFY" }],
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.details).toBe(
      `${locationPrefix("Generations Raceway")}\n\nElectric go-karts.`,
    );
    expect(parsed.items[0]?.details).not.toContain("https://");
    expect(parsed.items[0]?.customerFacingNotes).not.toContain("https://");
    expect(parsed.ignoredSourceUrls).toBe(1);
    expect(parsed.skippedVerificationItems).toBe(1);
  });

  it("does not double-prefix an already mapped location", () => {
    const details = `${locationPrefix("AdventurePlex")}\n\nBoutique bowling.`;
    const mapped = mapSalesKnowledgeRecord({
      ...validRecord,
      name: "Bowling",
      details,
      locationLabel: "AdventurePlex",
    });
    expect(mapped.details).toBe(details);
  });

  it("rejects duplicates, invalid types, and min/max conflicts", () => {
    expect(() =>
      parseSalesKnowledgeDataset({
        knowledge: [
          validRecord,
          { ...validRecord },
          {
            ...validRecord,
            name: "Broken",
            type: "CATALOG",
            minGuests: 10,
            maxGuests: 2,
            durationMinutes: 0,
            waiverRequired: "yes" as unknown as boolean,
            active: "true" as unknown as boolean,
          },
        ],
      }),
    ).toThrow(SalesKnowledgeDatasetError);
  });

  it("does not turn needs-verification topics into knowledge items", () => {
    const parsed = parseSalesKnowledgeDataset({
      knowledge: [validRecord],
      needsVerification: [
        { topic: "AdventurePlex operating hours" },
        { topic: "Axe Throwing minimum age" },
      ],
    });
    expect(parsed.items.map((item) => item.name)).toEqual(["Go-Kart Racing"]);
    expect(parsed.items.some((item) => /hours|13\+/i.test(item.details))).toBe(false);
    expect(parsed.skippedVerificationItems).toBe(2);
  });

  it("validates the committed development dataset", () => {
    const parsed = loadSalesKnowledgeDatasetFromDirectory();
    expect(parsed.items).toHaveLength(41);
    expect(parsed.skippedVerificationItems).toBe(7);
    expect(parsed.items.filter((item) => item.name === "Go-Kart Racing")[0]?.waiverRequired).toBe(
      true,
    );
    expect(parsed.items.some((item) => item.details.includes("Location: Generations Raceway"))).toBe(
      true,
    );
    const hours = parsed.items.find((item) => item.name === "AdventurePlex Regular Operating Hours");
    expect(hours?.details).toMatch(/Thursday: 3:00 PM–9:00 PM/);
    expect(hours?.details).toMatch(/Monday: Closed for private events/);
    expect(hours?.details).toContain("Location: AdventurePlex");
    expect(
      parsed.items.some(
        (item) => item.name === "Generations Raceway Attractions" && item.details.includes("Putt Mania"),
      ),
    ).toBe(true);
    expect(parsed.items.every((item) => !item.details.includes("http"))).toBe(true);
  });

  it("keeps default tenant provisioning free of this dataset", () => {
    const provision = readFileSync(
      path.join(process.cwd(), "src/server/services/provision-organization.ts"),
      "utf8",
    );
    const client = readFileSync(
      path.join(process.cwd(), "src/server/services/create-client-tenant.ts"),
      "utf8",
    );
    const sync = readFileSync(
      path.join(process.cwd(), "scripts/sync-auth-reference-data.ts"),
      "utf8",
    );
    expect(provision).not.toContain("sales-knowledge.json");
    expect(client).not.toContain("sales-knowledge.json");
    expect(sync).not.toContain("sales-knowledge.json");
    expect(provision).not.toContain("generations-sales-knowledge");
    expect(client).not.toContain("generations-sales-knowledge");
  });

  it("normalizes hyphenated search terms", () => {
    expect(salesKnowledgeSearchTerms("go-kart")).toEqual(["go", "kart"]);
    expect(salesKnowledgeSearchTerms("birthday")).toEqual(["birthday"]);
    expect(salesKnowledgeSearchTerms("What can a 10 year old do at Generations Raceway?")).toContain(
      "raceway",
    );
  });

  it("keeps generic agent instructions tenant-agnostic", () => {
    const text = salesAgentInstructions("Riverside Fun Center");
    expect(text).toContain("Riverside Fun Center");
    expect(text).not.toMatch(/generations/i);
    expect(text).toMatch(/different physical destinations/i);
    expect(text).toMatch(/operating hours/i);
    expect(text).toMatch(/ages/i);
    expect(text).toMatch(/ask which destination/i);
    expect(text).not.toMatch(/3:00 PM–9:00 PM/);
  });
});
