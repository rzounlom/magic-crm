import { SignIn } from "@clerk/nextjs";

import { clerkAppearance } from "@/lib/auth/clerk-appearance";

export default function SignInPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-6 py-16">
      <p className="mb-8 text-sm font-semibold tracking-[0.18em] text-primary uppercase">
        MagicCRM
      </p>
      <SignIn appearance={clerkAppearance} fallbackRedirectUrl="/app" />
    </div>
  );
}
