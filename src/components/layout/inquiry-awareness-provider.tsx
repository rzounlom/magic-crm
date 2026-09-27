"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { InquiryNotificationBell } from "@/components/layout/inquiry-notification-bell";
import type { InquiryAwarenessResponse, InquiryAwarenessSnapshot } from "@/lib/inquiries/inquiry-awareness";
import { useInquiryAwarenessPolling } from "@/lib/inquiries/use-inquiry-awareness-polling";
import { notify } from "@/lib/ui/notify";
import {
  loadInquiryAwarenessAction,
  markAllInquiryNotificationsSeenAction,
  markInquiryNotificationSeenAction,
} from "@/server/actions/inquiry-notifications";

type InquiryAwarenessContextValue = {
  acknowledge: (inquiryId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markingAll: boolean;
};

const InquiryAwarenessContext = createContext<InquiryAwarenessContextValue | null>(null);

export function InquiryAwarenessProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  const [snapshot, setSnapshot] = useState<InquiryAwarenessSnapshot | null>(null);

  const load = useCallback(async () => {
    try {
      return await loadInquiryAwarenessAction();
    } catch {
      return null;
    }
  }, []);

  const { publishSnapshot } = useInquiryAwarenessPolling({
    load,
    pathname,
    onSnapshot: (next) => {
      setAllowed(true);
      setSnapshot(next);
    },
    onDenied: () => {
      setAllowed(false);
      setSnapshot(null);
    },
    onToast: (title) => {
      notify.info({ title });
    },
    onListRefresh: () => {
      router.refresh();
    },
  });

  const acknowledgeRequest = useRef<string | null>(null);
  const markingAllRef = useRef(false);
  const [markingAll, setMarkingAll] = useState(false);

  const applyResult = useCallback(
    (result: InquiryAwarenessResponse | null) => {
      if (!result) {
        return;
      }
      if (!result.allowed) {
        setAllowed(false);
        setSnapshot(null);
        return;
      }
      publishSnapshot(result.snapshot);
    },
    [publishSnapshot],
  );

  const acknowledge = useCallback(
    async (inquiryId: string) => {
      if (acknowledgeRequest.current === inquiryId) {
        return;
      }
      acknowledgeRequest.current = inquiryId;
      try {
        applyResult(await markInquiryNotificationSeenAction(inquiryId));
      } catch {
        notify.error({ title: "Unable to update notifications" });
      } finally {
        if (acknowledgeRequest.current === inquiryId) {
          acknowledgeRequest.current = null;
        }
      }
    },
    [applyResult],
  );

  const markAllRead = useCallback(async () => {
    if (markingAllRef.current) {
      return;
    }
    markingAllRef.current = true;
    setMarkingAll(true);
    try {
      applyResult(await markAllInquiryNotificationsSeenAction());
    } catch {
      notify.error({ title: "Unable to update notifications" });
    } finally {
      markingAllRef.current = false;
      setMarkingAll(false);
    }
  }, [applyResult]);

  const awareness = useMemo(
    () => ({ acknowledge, markAllRead, markingAll }),
    [acknowledge, markAllRead, markingAll],
  );

  return (
    <InquiryAwarenessContext.Provider value={awareness}>
      <InquiryAwarenessSnapshotContext.Provider value={allowed ? snapshot : null}>
        {children}
      </InquiryAwarenessSnapshotContext.Provider>
    </InquiryAwarenessContext.Provider>
  );
}

const InquiryAwarenessSnapshotContext = createContext<InquiryAwarenessSnapshot | null>(null);

export function InquiryNotificationControl() {
  const snapshot = useContext(InquiryAwarenessSnapshotContext);
  const awareness = useInquiryAwareness();
  if (!snapshot || !awareness) {
    return null;
  }
  return (
    <InquiryNotificationBell
      unreadCount={snapshot.unreadCount}
      items={snapshot.notifications}
      markingAll={awareness.markingAll}
      onMarkAllRead={() => {
        void awareness.markAllRead();
      }}
    />
  );
}

export function useInquiryAwareness(): InquiryAwarenessContextValue | null {
  return useContext(InquiryAwarenessContext);
}
