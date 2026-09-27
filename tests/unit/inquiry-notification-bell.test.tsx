/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InquiryNotificationBell } from "@/components/layout/inquiry-notification-bell";
import type { InquiryNotificationItem } from "@/lib/inquiries/inquiry-awareness";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inquiries",
  useRouter: () => ({ refresh: vi.fn() }),
}));

const now = new Date("2026-09-26T17:08:00.000Z");

function item(overrides: Partial<InquiryNotificationItem> = {}): InquiryNotificationItem {
  return {
    id: "inq_jake",
    kind: "inquiry.created",
    title: "New inquiry",
    customerLabel: "Jake",
    detail: "20 guests · Celebration",
    createdAt: "2026-09-26T17:00:00.000Z",
    href: "/app/inquiries/inq_jake",
    unread: true,
    ...overrides,
  };
}

describe("inquiry notification bell", () => {
  afterEach(() => {
    cleanup();
  });
  it("hides the badge when nothing is unread and shows 9+ above nine", () => {
    const { rerender } = render(<InquiryNotificationBell unreadCount={0} items={[]} now={now} />);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(screen.queryByText("9+")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();

    rerender(<InquiryNotificationBell unreadCount={10} items={[item()]} now={now} />);
    expect(screen.getByRole("button", { name: "Notifications, 10 unread" })).toBeTruthy();
    expect(screen.getByText("9+")).toBeTruthy();
  });

  it("opens the popover, distinguishes unread, and links to the inquiry and the list", async () => {
    const user = userEvent.setup();
    render(
      <InquiryNotificationBell
        unreadCount={1}
        now={now}
        items={[
          item(),
          item({
            id: "inq_sarah",
            customerLabel: "Sarah",
            detail: "12 guests · Birthday",
            createdAt: "2026-09-26T16:00:00.000Z",
            href: "/app/inquiries/inq_sarah",
            unread: false,
          }),
        ]}
      />,
    );

    expect(screen.queryByText("View all inquiries")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    expect(screen.getByText("View all inquiries").getAttribute("href")).toBe("/app/inquiries");
    const jake = screen.getByRole("link", { name: /Jake/ });
    const sarah = screen.getByRole("link", { name: /Sarah/ });
    expect(jake.getAttribute("href")).toBe("/app/inquiries/inq_jake");
    expect(jake.getAttribute("data-unread")).toBe("true");
    expect(sarah.getAttribute("data-unread")).toBe("false");
    expect(jake.className).toContain("cursor-pointer");
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" }).className).toContain("cursor-pointer");
    expect(screen.getByText("8 min ago")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeTruthy();
  });

  it("shows Mark all as read only when something is unread and reports the click", async () => {
    const user = userEvent.setup();
    const onMarkAllRead = vi.fn();
    const { rerender } = render(
      <InquiryNotificationBell unreadCount={2} items={[item()]} now={now} onMarkAllRead={onMarkAllRead} />,
    );
    await user.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    await user.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);

    rerender(
      <InquiryNotificationBell
        unreadCount={2}
        items={[item()]}
        now={now}
        onMarkAllRead={onMarkAllRead}
        markingAll
      />,
    );
    expect(screen.getByRole("button", { name: "Marking…" }).hasAttribute("disabled")).toBe(true);

    rerender(<InquiryNotificationBell unreadCount={0} items={[item({ unread: false })]} now={now} onMarkAllRead={onMarkAllRead} />);
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Marking…" })).toBeNull();
  });
});
