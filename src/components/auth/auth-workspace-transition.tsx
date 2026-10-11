import Link from "next/link";

import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";

export type AuthWorkspaceTransitionPhase =
  | "checking"
  | "redirecting"
  | "loading_workspace"
  | "recovering";

type AuthWorkspaceTransitionProps = {
  phase?: AuthWorkspaceTransitionPhase;
  showRecovery?: boolean;
  className?: string;
};

const PHASE_DETAIL: Record<AuthWorkspaceTransitionPhase, string> = {
  checking: "Securely checking your session and loading your organization.",
  redirecting: "Securely checking your session and loading your organization.",
  loading_workspace: "Securely checking your session and loading your organization.",
  recovering: "This is taking longer than usual. You can keep waiting or return to sign in.",
};

/**
 * Premium branded auth/session transition — UX10 navy surface, no fake percentages.
 */
export function AuthWorkspaceTransition({
  phase = "checking",
  showRecovery = false,
  className,
}: AuthWorkspaceTransitionProps) {
  const effectivePhase = showRecovery ? "recovering" : phase;
  const detail = PHASE_DETAIL[effectivePhase];

  return (
    <div
      className={cn("auth-workspace-transition", className)}
      data-auth-transition
      data-phase={effectivePhase}
      role="status"
      aria-live="polite"
      aria-busy={effectivePhase !== "recovering"}
    >
      <div className="auth-workspace-transition-glow" aria-hidden />
      <div className="auth-workspace-transition-panel marketing-reveal">
        <div className="brand-mark auth-workspace-transition-brand">
          <span className="brand-mark-mark" aria-hidden>
            M
          </span>
          <span>MagicCRM</span>
        </div>

        <h1 className="auth-workspace-transition-title">Getting your workspace ready</h1>
        <p className="auth-workspace-transition-detail" id="auth-workspace-transition-detail">
          {detail}
        </p>

        <div
          className="auth-workspace-transition-progress"
          aria-hidden={effectivePhase === "recovering"}
        >
          <span className="auth-workspace-transition-progress-bar" />
        </div>

        {showRecovery ? (
          <div className="auth-workspace-transition-recovery">
            <p className="text-sm text-white/75">
              If you were signed out, continue to sign in. Your session was not altered.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/sign-in"
                className={buttonClassName({
                  variant: "primary",
                  size: "md",
                  className: "shadow-lg",
                })}
              >
                Return to sign in
              </Link>
              <Link
                href="/"
                className={buttonClassName({
                  variant: "secondary",
                  size: "md",
                  className: "border-white/30 bg-white/10 text-white hover:bg-white/15",
                })}
              >
                Marketing home
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
