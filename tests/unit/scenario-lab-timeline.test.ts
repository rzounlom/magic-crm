import { describe, expect, it } from "vitest";

import { SCENARIO_LAB_TIMELINE_KINDS } from "@/server/scenario-lab/constants";
import { appendTimeline, createTimelineEntry, parseTimeline } from "@/server/scenario-lab/timeline";

describe("scenario lab timeline", () => {
  it("appends and parses timeline entries", () => {
    const first = createTimelineEntry({
      kind: SCENARIO_LAB_TIMELINE_KINDS.OPERATOR_ACTION,
      code: "run_created",
      message: "Created",
    });
    const next = appendTimeline([], first);
    expect(parseTimeline(next)).toHaveLength(1);
    expect(parseTimeline(next)[0]?.code).toBe("run_created");
  });

  it("ignores malformed timeline JSON", () => {
    expect(parseTimeline([{ nope: true }, null, "x"])).toEqual([]);
  });
});
