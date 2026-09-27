/** @vitest-environment jsdom */

import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcknowledgeInquiryView } from "@/components/layout/acknowledge-inquiry-view";
import {
  InquiryAwarenessProvider,
  InquiryNotificationControl,
} from "@/components/layout/inquiry-awareness-provider";
import {
  INQUIRY_AWARENESS_POLL_MS,
  type InquiryAwarenessResponse,
  type InquiryAwarenessSnapshot,
} from "@/lib/inquiries/inquiry-awareness";
import { useInquiryAwarenessPolling } from "@/lib/inquiries/use-inquiry-awareness-polling";
import { notify } from "@/lib/ui/notify";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inquiries",
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/server/actions/inquiry-notifications", () => ({
  loadInquiryAwarenessAction: vi.fn(),
  markInquiryNotificationSeenAction: vi.fn(),
  markAllInquiryNotificationsSeenAction: vi.fn(),
}));

vi.mock("@/lib/ui/notify", () => ({
  notify: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function snapshot(id: string, createdAt: string, unreadCount: number): InquiryAwarenessSnapshot {
  return {
    organizationId: "org-a",
    unreadCount,
    newestInquiryId: id,
    newestInquiryAt: createdAt,
    notifications: [
      {
        id,
        kind: "inquiry.created",
        title: "New inquiry",
        customerLabel: "Jake",
        detail: "20 guests · Celebration",
        createdAt,
        href: `/app/inquiries/${id}`,
        unread: unreadCount > 0,
      },
    ],
  };
}

describe("inquiry awareness polling", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("toasts only inquiries that arrive after the baseline, including an aggregated burst", async () => {
    vi.useFakeTimers();
    const baseline = snapshot("inq_old", "2026-09-26T17:00:00.000Z", 0);
    const one = {
      ...snapshot("inq_jake", "2026-09-26T17:05:00.000Z", 1),
      notifications: [
        {
          id: "inq_jake",
          kind: "inquiry.created" as const,
          title: "New inquiry",
          customerLabel: "Jake",
          detail: "20 guests · Celebration",
          createdAt: "2026-09-26T17:05:00.000Z",
          href: "/app/inquiries/inq_jake",
          unread: true,
        },
        {
          ...baseline.notifications[0]!,
          unread: false,
        },
      ],
    };
    const burst: InquiryAwarenessSnapshot = {
      organizationId: "org-a",
      unreadCount: 3,
      newestInquiryId: "inq_c",
      newestInquiryAt: "2026-09-26T17:08:00.000Z",
      notifications: [
        {
          id: "inq_c",
          kind: "inquiry.created",
          title: "New inquiry",
          customerLabel: "Cara",
          detail: "12 guests · Birthday",
          createdAt: "2026-09-26T17:08:00.000Z",
          href: "/app/inquiries/inq_c",
          unread: true,
        },
        {
          id: "inq_b",
          kind: "inquiry.created",
          title: "New inquiry",
          customerLabel: "Ben",
          detail: "8 guests · Birthday",
          createdAt: "2026-09-26T17:07:00.000Z",
          href: "/app/inquiries/inq_b",
          unread: true,
        },
      ],
    };
    const load = vi
      .fn<() => Promise<InquiryAwarenessResponse>>()
      .mockResolvedValueOnce({ allowed: true, snapshot: baseline })
      .mockResolvedValueOnce({ allowed: true, snapshot: one })
      .mockResolvedValueOnce({ allowed: true, snapshot: one })
      .mockResolvedValueOnce({ allowed: true, snapshot: burst });
    const onToast = vi.fn();
    const onListRefresh = vi.fn();

    renderHook(() =>
      useInquiryAwarenessPolling({
        load,
        onSnapshot: vi.fn(),
        onDenied: vi.fn(),
        onToast,
        onListRefresh,
        pathname: "/app/inquiries",
        intervalMs: INQUIRY_AWARENESS_POLL_MS,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(onToast).not.toHaveBeenCalled();
    expect(onListRefresh).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INQUIRY_AWARENESS_POLL_MS);
    });
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith("New inquiry from Jake");
    expect(onListRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INQUIRY_AWARENESS_POLL_MS);
    });
    expect(onToast).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INQUIRY_AWARENESS_POLL_MS);
    });
    expect(onToast).toHaveBeenCalledWith("2 new inquiries received");
  });

  it("pauses while hidden, refreshes when visible, and recovers from a failed poll", async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    const load = vi
      .fn<() => Promise<InquiryAwarenessResponse>>()
      .mockResolvedValueOnce({
        allowed: true,
        snapshot: snapshot("inq_old", "2026-09-26T17:00:00.000Z", 0),
      })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({
        allowed: true,
        snapshot: snapshot("inq_new", "2026-09-26T17:10:00.000Z", 1),
      });
    const onToast = vi.fn();

    const { unmount } = renderHook(() =>
      useInquiryAwarenessPolling({
        load,
        onSnapshot: vi.fn(),
        onDenied: vi.fn(),
        onToast,
        onListRefresh: vi.fn(),
        pathname: "/app",
        intervalMs: INQUIRY_AWARENESS_POLL_MS,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(1);

    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INQUIRY_AWARENESS_POLL_MS * 3);
    });
    expect(load).toHaveBeenCalledTimes(1);

    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INQUIRY_AWARENESS_POLL_MS);
    });
    expect(onToast).toHaveBeenCalledWith("New inquiry from Jake");

    const callsBeforeUnmount = load.mock.calls.length;
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INQUIRY_AWARENESS_POLL_MS * 2);
    });
    expect(load).toHaveBeenCalledTimes(callsBeforeUnmount);
  });

  it("does not start another poll while one request is still in flight", async () => {
    vi.useFakeTimers();
    let resolveLoad: (value: InquiryAwarenessResponse) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<InquiryAwarenessResponse>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    renderHook(() =>
      useInquiryAwarenessPolling({
        load,
        onSnapshot: vi.fn(),
        onDenied: vi.fn(),
        onToast: vi.fn(),
        onListRefresh: vi.fn(),
        pathname: "/app/inquiries",
        intervalMs: INQUIRY_AWARENESS_POLL_MS,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INQUIRY_AWARENESS_POLL_MS * 2);
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveLoad({
        allowed: true,
        snapshot: snapshot("inq_old", "2026-09-26T17:00:00.000Z", 0),
      });
      await Promise.resolve();
    });
  });

  it("publishes a seen snapshot immediately and ignores an older unread poll", async () => {
    vi.useFakeTimers();
    const resolvers: Array<(value: InquiryAwarenessResponse) => void> = [];
    const load = vi.fn(
      () =>
        new Promise<InquiryAwarenessResponse>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const onSnapshot = vi.fn();
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useInquiryAwarenessPolling({
        load,
        onSnapshot,
        onDenied: vi.fn(),
        onToast,
        onListRefresh: vi.fn(),
        pathname: "/app/inquiries/inq_jake",
        intervalMs: INQUIRY_AWARENESS_POLL_MS,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    const unread = snapshot("inq_jake", "2026-09-26T17:05:00.000Z", 1);
    const read = snapshot("inq_jake", "2026-09-26T17:05:00.000Z", 0);
    await act(async () => {
      resolvers[0]?.({ allowed: true, snapshot: unread });
      await Promise.resolve();
    });
    expect(onToast).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INQUIRY_AWARENESS_POLL_MS);
    });
    expect(load).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.publishSnapshot(read);
    });
    expect(onSnapshot).toHaveBeenLastCalledWith(read);
    expect(onToast).not.toHaveBeenCalled();

    await act(async () => {
      resolvers[1]?.({ allowed: true, snapshot: unread });
      await Promise.resolve();
    });
    expect(onSnapshot).toHaveBeenLastCalledWith(read);
    expect(onToast).not.toHaveBeenCalled();
  });

  it("marks the open inquiry read from the detail view and updates the bell without a toast", async () => {
    const { loadInquiryAwarenessAction, markInquiryNotificationSeenAction } = await import(
      "@/server/actions/inquiry-notifications"
    );
    const unread = snapshot("inq_jake", "2026-09-26T17:05:00.000Z", 1);
    const read = snapshot("inq_jake", "2026-09-26T17:05:00.000Z", 0);
    vi.mocked(loadInquiryAwarenessAction).mockResolvedValue({ allowed: true, snapshot: unread });
    vi.mocked(markInquiryNotificationSeenAction).mockResolvedValue({ allowed: true, snapshot: read });

    render(
      <InquiryAwarenessProvider>
        <InquiryNotificationControl />
        <AcknowledgeInquiryView inquiryId="inq_jake" />
      </InquiryAwarenessProvider>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(markInquiryNotificationSeenAction).toHaveBeenCalledWith("inq_jake");
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(notify.info).not.toHaveBeenCalled();
  });

  it("hides inquiry notifications when the employee cannot view inquiries", async () => {
    const { loadInquiryAwarenessAction } = await import("@/server/actions/inquiry-notifications");
    vi.mocked(loadInquiryAwarenessAction).mockResolvedValue({ allowed: false });

    render(
      <InquiryAwarenessProvider>
        <InquiryNotificationControl />
      </InquiryAwarenessProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /Notifications/ })).toBeNull();
    expect(notify.info).not.toHaveBeenCalled();
  });
});
