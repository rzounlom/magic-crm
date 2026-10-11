/**
 * Development-only auth transition timing. Never logs tokens, cookies, or PII.
 */

export type AuthTimingCheckpoint =
  | "route_mount"
  | "clerk_loaded"
  | "session_determined"
  | "redirect_initiated"
  | "app_shell_start"
  | "provision_done"
  | "chrome_done"
  | "app_ready";

const marks = new Map<string, number>();

function enabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function markAuthTiming(
  checkpoint: AuthTimingCheckpoint,
  detail?: Record<string, string | boolean | number | null | undefined>,
): void {
  if (!enabled()) {
    return;
  }

  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const previous = marks.get("route_mount");
  const elapsedMs = previous != null ? Math.round(now - previous) : 0;
  marks.set(checkpoint, now);

  const safeDetail: Record<string, string | boolean | number> = {};
  if (detail) {
    for (const [key, value] of Object.entries(detail)) {
      if (value === undefined || value === null) continue;
      // Refuse anything that looks like a secret/token.
      if (/token|cookie|secret|password|authorization/i.test(key)) continue;
      if (typeof value === "string" && value.length > 80) continue;
      safeDetail[key] = value;
    }
  }

  console.info(
    JSON.stringify({
      scope: "magiccrm.auth1",
      checkpoint,
      elapsedMs,
      ...safeDetail,
    }),
  );
}

export function resetAuthTiming(): void {
  marks.clear();
}
