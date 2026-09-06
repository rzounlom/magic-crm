import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  rankSalesKnowledgeItems,
  salesKnowledgeSearchTerms,
} from "@/server/services/sales-knowledge-service";

const racewayGoKarts = {
  name: "Go-Kart Racing",
  type: "ATTRACTION",
  shortDescription: "Junior indoor electric go-kart racing and family racing activities.",
  details: "Location: Generations Raceway\n\nIndoor electric racing for kids and families. Ages 8 and up.",
  customerFacingNotes: "Ages 8+.",
  salesNotes: null,
};

const racewayPutt = {
  name: "Putt Mania",
  type: "ATTRACTION",
  shortDescription: "Mini golf activity for kids and families.",
  details: "Location: Generations Raceway\n\nInteractive mini golf activities for kids and families.",
  customerFacingNotes: null,
  salesNotes: null,
};

const racewayArcade = {
  name: "Game Zone Arcade",
  type: "ATTRACTION",
  shortDescription: "Arcade activities for kids and families.",
  details: "Location: Generations Raceway\n\nGame Zone arcade activities with more than 30 games.",
  customerFacingNotes: null,
  salesNotes: null,
};

const adventureHours = {
  name: "AdventurePlex Regular Operating Hours",
  type: "POLICY",
  shortDescription: "Regular public opening hours.",
  details:
    "Location: AdventurePlex\n\nThursday: 3:00 PM–9:00 PM\nMonday: Closed for private events\nRegular public opening hours.",
  customerFacingNotes: "Regular hours only.",
  salesNotes: "Do not apply these hours to another destination.",
};

const adventureBowling = {
  name: "Bowling",
  type: "ATTRACTION",
  shortDescription: "Boutique bowling",
  details: "Location: AdventurePlex\n\nBowling lanes.",
  customerFacingNotes: null,
  salesNotes: null,
};

describe("sales knowledge retrieval", () => {
  it("keeps location and activity terms from natural questions", () => {
    expect(salesKnowledgeSearchTerms("What can a 10 year old do at Generations Raceway?")).toEqual([
      "year",
      "old",
      "generations",
      "raceway",
    ]);
    expect(salesKnowledgeSearchTerms("What is there for kids at the Raceway?")).toEqual([
      "kids",
      "raceway",
    ]);
    expect(salesKnowledgeSearchTerms("Does Raceway have anything besides go karts?")).toEqual([
      "raceway",
      "go",
      "karts",
    ]);
    expect(salesKnowledgeSearchTerms("Tell me about Putt Mania.")).toEqual(["putt", "mania"]);
    expect(salesKnowledgeSearchTerms("What time are you open Thursday?")).toEqual([
      "time",
      "open",
      "thursday",
    ]);
    expect(salesKnowledgeSearchTerms("go-kart")).toEqual(["go", "kart"]);
  });

  it("ranks Raceway attraction questions ahead of unrelated hours", () => {
    const ranked = rankSalesKnowledgeItems(
      [adventureHours, adventureBowling, racewayGoKarts, racewayPutt, racewayArcade],
      salesKnowledgeSearchTerms("What can a 10 year old do at Generations Raceway?"),
    );
    const names = ranked.map((item) => item.name);
    expect(names).toContain("Go-Kart Racing");
    expect(names).toContain("Putt Mania");
    expect(names).toContain("Game Zone Arcade");
    expect(names[0]).not.toBe("AdventurePlex Regular Operating Hours");
    expect(ranked.find((item) => item.name === "AdventurePlex Regular Operating Hours")).toBeUndefined();
  });

  it("retrieves Thursday hours without treating them as Raceway hours", () => {
    const thursday = rankSalesKnowledgeItems(
      [adventureHours, racewayGoKarts, racewayPutt],
      salesKnowledgeSearchTerms("Thursday hours"),
    );
    expect(thursday[0]?.name).toBe("AdventurePlex Regular Operating Hours");
    expect(thursday[0]?.details).toMatch(/3:00 PM–9:00 PM/);

    const racewayHours = rankSalesKnowledgeItems(
      [adventureHours, racewayGoKarts, racewayPutt],
      salesKnowledgeSearchTerms("Raceway Thursday hours"),
    );
    expect(racewayHours.some((item) => item.name === "AdventurePlex Regular Operating Hours")).toBe(
      false,
    );
  });

  it("does not invent age eligibility when knowledge only lists the attraction", () => {
    const ranked = rankSalesKnowledgeItems(
      [racewayPutt],
      salesKnowledgeSearchTerms("What can a 10 year old do at the Raceway?"),
    );
    expect(ranked[0]?.name).toBe("Putt Mania");
    expect(ranked[0]?.details).not.toMatch(/ages?\s*10/i);
    expect(ranked[0]?.details).not.toMatch(/10\+/);
  });

  it("keeps retrieval helpers tenant-agnostic", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/server/services/sales-knowledge-service.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/AdventurePlex/);
    expect(source).not.toMatch(/Raceway/);
    expect(source).not.toMatch(/Generations/);
  });
});
