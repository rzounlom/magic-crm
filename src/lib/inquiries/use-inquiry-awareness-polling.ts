"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  EMPTY_AWARENESS_SESSION,
  INQUIRY_AWARENESS_POLL_MS,
  reduceInquiryAwareness,
  type AwarenessSession,
  type InquiryAwarenessResponse,
  type InquiryAwarenessSnapshot,
} from "@/lib/inquiries/inquiry-awareness";

export type InquiryAwarenessPollHandlers = {
  load: () => Promise<InquiryAwarenessResponse | null>;
  onSnapshot: (snapshot: InquiryAwarenessSnapshot) => void;
  onDenied: () => void;
  onToast: (title: string) => void;
  onListRefresh: () => void;
  pathname: string;
  intervalMs?: number;
};

export function useInquiryAwarenessPolling({
  load,
  onSnapshot,
  onDenied,
  onToast,
  onListRefresh,
  pathname,
  intervalMs = INQUIRY_AWARENESS_POLL_MS,
}: InquiryAwarenessPollHandlers): {
  refreshNow: () => Promise<void>;
  publishSnapshot: (snapshot: InquiryAwarenessSnapshot) => void;
} {
  const sessionRef = useRef<AwarenessSession>(EMPTY_AWARENESS_SESSION);
  const pathnameRef = useRef(pathname);
  const inFlightRef = useRef(false);
  const stoppedRef = useRef(false);
  const hiddenRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const epochRef = useRef(0);
  const applySnapshotRef = useRef<(snapshot: InquiryAwarenessSnapshot) => void>(() => {});
  const timerRef = useRef<number | null>(null);
  const runRef = useRef<() => Promise<void>>(async () => {});
  const loadRef = useRef(load);
  const onSnapshotRef = useRef(onSnapshot);
  const onDeniedRef = useRef(onDenied);
  const onToastRef = useRef(onToast);
  const onListRefreshRef = useRef(onListRefresh);

  useEffect(() => {
    pathnameRef.current = pathname;
    loadRef.current = load;
    onSnapshotRef.current = onSnapshot;
    onDeniedRef.current = onDenied;
    onToastRef.current = onToast;
    onListRefreshRef.current = onListRefresh;
  });

  useEffect(() => {
    stoppedRef.current = false;
    hiddenRef.current = document.visibilityState === "hidden";

    function clearTimer() {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function schedule() {
      clearTimer();
      if (stoppedRef.current || hiddenRef.current) {
        return;
      }
      timerRef.current = window.setTimeout(() => {
        void runRef.current();
      }, intervalMs);
    }

    async function run() {
      if (stoppedRef.current || hiddenRef.current) {
        return;
      }
      if (inFlightRef.current) {
        pendingRefreshRef.current = true;
        return;
      }
      inFlightRef.current = true;
      const epoch = epochRef.current;
      try {
        const result = await loadRef.current();
        if (stoppedRef.current || epoch !== epochRef.current) {
          return;
        }
        if (!result) {
          return;
        }
        if (!result.allowed) {
          onDeniedRef.current();
          stoppedRef.current = true;
          return;
        }
        applySnapshot(result.snapshot);
      } catch {
        // The next interval retries. A failed poll does not surface an error.
      } finally {
        inFlightRef.current = false;
        const pending = pendingRefreshRef.current;
        pendingRefreshRef.current = false;
        if (stoppedRef.current || hiddenRef.current) {
          return;
        }
        if (pending) {
          void runRef.current();
          return;
        }
        schedule();
      }
    }

    function applySnapshot(snapshot: InquiryAwarenessSnapshot) {
      const update = reduceInquiryAwareness(sessionRef.current, snapshot, pathnameRef.current);
      sessionRef.current = update.session;
      onSnapshotRef.current(snapshot);
      if (update.toastTitle) {
        onToastRef.current(update.toastTitle);
      }
      if (update.refreshInquiryList) {
        onListRefreshRef.current();
      }
    }

    runRef.current = run;
    applySnapshotRef.current = applySnapshot;

    function onVisibility() {
      hiddenRef.current = document.visibilityState === "hidden";
      if (hiddenRef.current) {
        clearTimer();
        return;
      }
      void runRef.current();
    }

    document.addEventListener("visibilitychange", onVisibility);
    void run();

    return () => {
      stoppedRef.current = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);

  const refreshNow = useCallback(() => runRef.current(), []);
  const publishSnapshot = useCallback((snapshot: InquiryAwarenessSnapshot) => {
    epochRef.current += 1;
    applySnapshotRef.current(snapshot);
  }, []);
  return { refreshNow, publishSnapshot };
}
