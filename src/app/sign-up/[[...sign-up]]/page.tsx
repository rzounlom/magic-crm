import { SignUp } from "@clerk/nextjs";

import { clerkAppearance } from "@/lib/auth/clerk-appearance";

const signUpAppearance = {
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

export default function SignUpPage() {
  return (
    <div className="auth-sign-in-shell" data-auth-sign-up>
      <div className="auth-sign-in-shell-glow" aria-hidden />
      <div className="auth-sign-in-shell-panel">
        <div className="brand-mark auth-sign-in-brand">
          <span className="brand-mark-mark" aria-hidden>
            M
          </span>
          <span>MagicCRM</span>
        </div>
        <p className="auth-sign-in-eyebrow">Create employee account</p>
        <SignUp appearance={signUpAppearance} fallbackRedirectUrl="/app" />
      </div>
    </div>
  );
}
