/**
 * Clerk keys for Edge middleware. Do not import `@/lib/env` here —
 * that module requires DATABASE_URL and would take down public routes.
 */
export function readClerkMiddlewareKeys(source: NodeJS.Dict<string> = process.env): {
  publishableKey: string | undefined;
  secretKey: string | undefined;
  configured: boolean;
} {
  const publishableKey = source.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || undefined;
  const secretKey = source.CLERK_SECRET_KEY?.trim() || undefined;

  return {
    publishableKey,
    secretKey,
    configured: Boolean(publishableKey && secretKey),
  };
}
