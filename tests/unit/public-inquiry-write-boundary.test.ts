import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("public inquiry write boundary", () => {
  it("commits the inquiry graph in one nested write and generates plans after that write", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/server/services/inquiry-service.ts"),
      "utf8",
    );
    const body = functionBody(source, "createPublicInquiry");
    expect(body).not.toContain("$transaction");
    const createAt = body.indexOf("database.inquiry.create");
    const plansAt = body.indexOf("generateEventPlansForInquiry");
    expect(createAt).toBeGreaterThan(-1);
    expect(plansAt).toBeGreaterThan(createAt);
    expect(body).toContain("conversations:");
    expect(body).toContain("messages:");
    expect(body.indexOf("lastMessageAt")).toBeGreaterThan(createAt);
    expect(body.indexOf("lastMessageAt")).toBeLessThan(plansAt);
  });

  it("loads inquiry awareness from open inquiry ids instead of a correlated booking filter", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/server/services/inquiry-notification-service.ts"),
      "utf8",
    );
    const loaderStart = source.indexOf("async function loadInquiryAwarenessSnapshot");
    const loader = source.slice(loaderStart, source.indexOf("\nexport async function ", loaderStart));
    expect(loader).not.toContain("inquiryListWhere");
    expect(loader).not.toContain("bookings:");
    expect(loader).toContain("endedInquiryIds");
    expect(source).toContain("booking.findMany");
    expect(source).toContain("historicalConfirmedBookingWhere");
    expect(source).toContain("magiccrm.inquiry-awareness");
    expect(source).not.toContain("INQUIRY_AWARENESS_POLL_MS");
  });
});
