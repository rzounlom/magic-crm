import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Source_Sans_3 } from "next/font/google";

import { clerkAppearance } from "@/lib/auth/clerk-appearance";
import "./globals.css";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MagicCRM",
  description: "Booking, CRM & AI-assisted event sales",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en" className={`${sourceSans.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {publishableKey ? (
          <ClerkProvider
            publishableKey={publishableKey}
            appearance={clerkAppearance}
            afterSignOutUrl="/"
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
          >
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
