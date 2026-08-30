/**
 * Trusted server-side request context.
 *
 * RequestContext values must eventually be derived from trusted authenticated
 * server state (Clerk session + MagicCRM Organization mapping). Never construct
 * this from cookies, query parameters, headers, form fields, or other
 * browser-provided input. Browser-supplied organizationId is never authorization.
 *
 * Authentication is not implemented in this phase. There is intentionally no
 * getRequestContext() helper.
 */
export type RequestContext = {
  userId: string;
  organizationId: string;
  locationId?: string;
};
