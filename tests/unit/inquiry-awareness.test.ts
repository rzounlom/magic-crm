import { describe, expect, it } from "vitest";

import {
  EMPTY_AWARENESS_SESSION,
  formatNotificationAge,
  formatUnreadBadge,
  inquiryNotificationDetail,
  isInquiryListPath,
  reduceInquiryAwareness,
  type InquiryAwarenessSnapshot,
  type InquiryNotificationItem,
} from "@/lib/inquiries/inquiry-awareness";

function item(overrides: Partial<InquiryNotificationItem> & Pick<InquiryNotificationItem, "id" | "createdAt">): InquiryNotificationItem {
  return {
    kind: "inquiry.created",
    title: "New inquiry",
    customerLabel: "Jake",
    detail: "20 guests · Celebration",
    href: `/app/inquiries/${overrides.id}`,
    unread: true,
    ...overrides,
  };
}

function snapshot(
  organizationId: string,
  notifications: InquiryNotificationItem[],
  unreadCount = notifications.filter((entry) => entry.unread).length,
): InquiryAwarenessSnapshot {
  const newest = notifications[0] ?? null;
  return {
    organizationId,
    unreadCount,
    newestInquiryId: newest?.id ?? null,
    newestInquiryAt: newest?.createdAt ?? null,
    notifications,
  };
}

describe("inquiry awareness decisions", () => {
  it("establishes a baseline without a toast or list refresh", () => {
    const update = reduceInquiryAwareness(
      EMPTY_AWARENESS_SESSION,
      snapshot("org-a", [item({ id: "inq_old", createdAt: "2026-09-26T17:00:00.000Z" })]),
      "/app/inquiries",
    );
    expect(update.toastTitle).toBeNull();
    expect(update.refreshInquiryList).toBe(false);
    expect(update.session.baselineReady).toBe(true);
  });

  it("toasts one inquiry that arrives after the baseline and does not toast it again", () => {
    const baseline = reduceInquiryAwareness(
      EMPTY_AWARENESS_SESSION,
      snapshot("org-a", [item({ id: "inq_old", createdAt: "2026-09-26T17:00:00.000Z", unread: false })], 0),
      "/app/inquiries",
    );
    const arrived = reduceInquiryAwareness(
      baseline.session,
      snapshot("org-a", [
        item({ id: "inq_jake", createdAt: "2026-09-26T17:05:00.000Z", customerLabel: "Jake" }),
        item({ id: "inq_old", createdAt: "2026-09-26T17:00:00.000Z", unread: false }),
      ]),
      "/app/inquiries",
    );
    expect(arrived.toastTitle).toBe("New inquiry from Jake");
    expect(arrived.refreshInquiryList).toBe(true);

    const again = reduceInquiryAwareness(
      arrived.session,
      snapshot("org-a", [
        item({ id: "inq_jake", createdAt: "2026-09-26T17:05:00.000Z", customerLabel: "Jake" }),
      ]),
      "/app/inquiries",
    );
    expect(again.toastTitle).toBeNull();
    expect(again.refreshInquiryList).toBe(false);
  });

  it("aggregates several new inquiries into one toast", () => {
    const baseline = reduceInquiryAwareness(
      EMPTY_AWARENESS_SESSION,
      snapshot("org-a", [], 0),
      "/app",
    );
    const arrived = reduceInquiryAwareness(
      baseline.session,
      snapshot(
        "org-a",
        [
          item({ id: "c", createdAt: "2026-09-26T17:03:00.000Z", customerLabel: "Cara" }),
          item({ id: "b", createdAt: "2026-09-26T17:02:00.000Z", customerLabel: "Ben" }),
          item({ id: "a", createdAt: "2026-09-26T17:01:00.000Z", customerLabel: "Ada" }),
        ],
        3,
      ),
      "/app/bookings",
    );
    expect(arrived.toastTitle).toBe("3 new inquiries received");
    expect(arrived.refreshInquiryList).toBe(false);
  });

  it("refreshes the inquiry list only on that route", () => {
    expect(isInquiryListPath("/app/inquiries")).toBe(true);
    expect(isInquiryListPath("/app/inquiries/inq_1")).toBe(false);
  });

  it("resets the baseline when the active organization changes and does not toast existing inquiries", () => {
    const first = reduceInquiryAwareness(
      EMPTY_AWARENESS_SESSION,
      snapshot("org-a", [item({ id: "a", createdAt: "2026-09-26T17:00:00.000Z" })]),
      "/app/inquiries",
    );
    const switched = reduceInquiryAwareness(
      first.session,
      snapshot("org-b", [item({ id: "b", createdAt: "2026-09-26T18:00:00.000Z", customerLabel: "Sarah" })]),
      "/app/inquiries",
    );
    expect(switched.toastTitle).toBeNull();
    expect(switched.refreshInquiryList).toBe(false);
    expect(switched.session.organizationId).toBe("org-b");
  });

  it("does not toast when an existing inquiry is marked read", () => {
    const baseline = reduceInquiryAwareness(
      EMPTY_AWARENESS_SESSION,
      snapshot("org-a", [
        item({ id: "inq_cara", createdAt: "2026-09-26T17:10:00.000Z", customerLabel: "Cara" }),
        item({ id: "inq_jake", createdAt: "2026-09-26T17:05:00.000Z", customerLabel: "Jake" }),
      ]),
      "/app/inquiries/inq_jake",
    );
    const read = reduceInquiryAwareness(
      baseline.session,
      snapshot("org-a", [
        item({ id: "inq_cara", createdAt: "2026-09-26T17:10:00.000Z", customerLabel: "Cara" }),
        item({ id: "inq_jake", createdAt: "2026-09-26T17:05:00.000Z", customerLabel: "Jake", unread: false }),
      ], 1),
      "/app/inquiries/inq_jake",
    );
    expect(read.toastTitle).toBeNull();
    expect(read.refreshInquiryList).toBe(false);
    expect(read.session.unreadCount).toBe(1);
  });

  it("formats the badge, detail line, and relative age", () => {
    expect(formatUnreadBadge(0)).toBeNull();
    expect(formatUnreadBadge(3)).toBe("3");
    expect(formatUnreadBadge(10)).toBe("9+");
    expect(inquiryNotificationDetail(20, "Celebration")).toBe("20 guests · Celebration");
    expect(formatNotificationAge("2026-09-26T17:00:30.000Z", new Date("2026-09-26T17:00:40.000Z"))).toBe("Just now");
    expect(formatNotificationAge("2026-09-26T17:00:00.000Z", new Date("2026-09-26T17:08:00.000Z"))).toBe("8 min ago");
  });
});
