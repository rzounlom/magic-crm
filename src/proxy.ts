import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { readClerkMiddlewareKeys } from "@/lib/auth/clerk-keys";

const clerkKeys = readClerkMiddlewareKeys();

function passthrough(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/app")) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export default clerkKeys.configured
  ? clerkMiddleware(async (auth, request) => {
      if (request.nextUrl.pathname.startsWith("/app")) {
        await auth.protect({
          unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
        });
      }
    })
  : passthrough;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
