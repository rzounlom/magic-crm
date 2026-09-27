export const INQUIRY_AWARENESS_POLL_MS = 15_000;
export const INQUIRY_NOTIFICATION_LIMIT = 8;

export type InquiryNotificationItem = {
  id: string;
  kind: "inquiry.created";
  title: string;
  customerLabel: string;
  detail: string;
  createdAt: string;
  href: string;
  unread: boolean;
};

export type InquiryAwarenessSnapshot = {
  organizationId: string;
  unreadCount: number;
  newestInquiryId: string | null;
  newestInquiryAt: string | null;
  notifications: InquiryNotificationItem[];
};

export type InquiryAwarenessResponse =
  | { allowed: false }
  | { allowed: true; snapshot: InquiryAwarenessSnapshot };

export type AwarenessSession = {
  organizationId: string | null;
  baselineReady: boolean;
  watermarkAt: string | null;
  newestInquiryId: string | null;
  unreadCount: number;
  toastedIds: string[];
};

export const EMPTY_AWARENESS_SESSION: AwarenessSession = {
  organizationId: null,
  baselineReady: false,
  watermarkAt: null,
  newestInquiryId: null,
  unreadCount: 0,
  toastedIds: [],
};

export function isInquiryListPath(pathname: string): boolean {
  return pathname === "/app/inquiries";
}

export function formatUnreadBadge(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  if (count > 9) {
    return "9+";
  }
  return String(count);
}

export function inquiryNotificationCustomerLabel(firstName: string | null | undefined): string {
  const name = firstName?.trim();
  return name || "A customer";
}

export function inquiryNotificationDetail(
  guestCount: number | null | undefined,
  eventGoal: string | null | undefined,
): string {
  const guests = guestCount != null && guestCount > 0 ? `${guestCount} guests` : null;
  const goal = eventGoal?.trim() || null;
  return [guests, goal].filter(Boolean).join(" · ");
}

export function inquiryNotificationToast(customerLabel: string): string {
  if (!customerLabel.trim() || customerLabel === "A customer") {
    return "New inquiry received";
  }
  return `New inquiry from ${customerLabel}`;
}

export function formatNotificationAge(createdAt: string, now: Date): string {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) {
    return "";
  }
  const delta = Math.max(0, now.getTime() - created);
  if (delta < 60_000) {
    return "Just now";
  }
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export type AwarenessUpdate = {
  session: AwarenessSession;
  toastTitle: string | null;
  refreshInquiryList: boolean;
};

export function reduceInquiryAwareness(
  session: AwarenessSession,
  snapshot: InquiryAwarenessSnapshot,
  pathname: string,
): AwarenessUpdate {
  const sameOrganization = session.organizationId === snapshot.organizationId;
  if (!session.baselineReady || !sameOrganization) {
    return {
      session: {
        organizationId: snapshot.organizationId,
        baselineReady: true,
        watermarkAt: snapshot.newestInquiryAt,
        newestInquiryId: snapshot.newestInquiryId,
        unreadCount: snapshot.unreadCount,
        toastedIds: [],
      },
      toastTitle: null,
      refreshInquiryList: false,
    };
  }

  const fresh = snapshot.notifications.filter((item) => {
    if (!item.unread || session.toastedIds.includes(item.id)) {
      return false;
    }
    if (!session.watermarkAt) {
      return true;
    }
    return item.createdAt > session.watermarkAt;
  });
  const arrivedCount = Math.max(fresh.length, snapshot.unreadCount - session.unreadCount);
  const toastTitle =
    arrivedCount <= 0
      ? null
      : arrivedCount === 1
        ? inquiryNotificationToast(fresh[0]?.customerLabel ?? "A customer")
        : `${arrivedCount} new inquiries received`;

  const newestChanged =
    snapshot.newestInquiryId !== session.newestInquiryId ||
    snapshot.newestInquiryAt !== session.watermarkAt;

  return {
    session: {
      organizationId: snapshot.organizationId,
      baselineReady: true,
      watermarkAt: snapshot.newestInquiryAt ?? session.watermarkAt,
      newestInquiryId: snapshot.newestInquiryId,
      unreadCount: snapshot.unreadCount,
      toastedIds: [...session.toastedIds, ...fresh.map((item) => item.id)],
    },
    toastTitle,
    refreshInquiryList: newestChanged && isInquiryListPath(pathname),
  };
}
