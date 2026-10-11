"use client";

import { ClerkLoaded, ClerkLoading, SignIn, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthWorkspaceTransition } from "@/components/auth/auth-workspace-transition";
import { markAuthTiming, resetAuthTiming } from "@/lib/auth/auth-timing";
import { clerkAppearance } from "@/lib/auth/clerk-appearance";

/** After this threshold, show recovery guidance (not an error). */
const RECOVERY_MS = 12_000;

const signInAppearance = {
  ...clerkAppearance,
  variables: {
    ...clerkAppearance.variables,
    colorBackground: "#ffffff",
  },
  elements: {
    rootBox: "mx-auto w-full",
    cardBox: "w-full shadow-xl",
    card: "bg-white",
  },
} as const;

type SignInExperienceProps = {
  fallbackRedirectUrl?: string;
};

/**
 * Client sign-in shell: branded transition while Clerk loads / redirects signed-in users;
 * Clerk SignIn UI promptly for signed-out users.
 */
export function SignInExperience({ fallbackRedirectUrl = "/app" }: SignInExperienceProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const redirectStarted = useRef(false);
  const waitKey = !isLoaded ? "loading" : isSignedIn ? "signed-in" : "signed-out";
  const [recoveryForKey, setRecoveryForKey] = useState<string | null>(null);

  useEffect(() => {
    resetAuthTiming();
    markAuthTiming("route_mount", { route: "/sign-in" });
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    markAuthTiming("clerk_loaded", { isSignedIn: Boolean(isSignedIn) });
    markAuthTiming("session_determined", { isSignedIn: Boolean(isSignedIn) });
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || redirectStarted.current) {
      return;
    }
    redirectStarted.current = true;
    markAuthTiming("redirect_initiated", { destination: fallbackRedirectUrl });
    router.replace(fallbackRedirectUrl);
  }, [fallbackRedirectUrl, isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (waitKey === "signed-out") {
      return;
    }
    const timer = window.setTimeout(() => {
      setRecoveryForKey(waitKey);
    }, RECOVERY_MS);
    return () => window.clearTimeout(timer);
  }, [waitKey]);

  const showRecovery = recoveryForKey === waitKey && waitKey !== "signed-out";

  if (!isLoaded || isSignedIn) {
    return (
      <AuthWorkspaceTransition
        phase={isSignedIn ? "redirecting" : "checking"}
        showRecovery={showRecovery}
      />
    );
  }

  return (
    <div className="auth-sign-in-shell" data-auth-sign-in-ready>
      <div className="auth-sign-in-shell-glow" aria-hidden />
      <div className="auth-sign-in-shell-panel">
        <div className="brand-mark auth-sign-in-brand">
          <span className="brand-mark-mark" aria-hidden>
            M
          </span>
          <span>MagicCRM</span>
        </div>
        <p className="auth-sign-in-eyebrow">Employee sign in</p>
        <ClerkLoading>
          <div className="auth-sign-in-clerk-pending" role="status" aria-live="polite">
            <p className="text-sm text-white/85">Loading secure sign-in…</p>
            <div className="auth-workspace-transition-progress mt-4">
              <span className="auth-workspace-transition-progress-bar" />
            </div>
          </div>
        </ClerkLoading>
        <ClerkLoaded>
          <SignIn appearance={signInAppearance} fallbackRedirectUrl={fallbackRedirectUrl} />
        </ClerkLoaded>
      </div>
    </div>
  );
}
