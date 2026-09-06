import { parseApplicationOrigin } from "@/lib/env/application-url";

export { ApplicationUrlError, parseApplicationOrigin } from "@/lib/env/application-url";

export const EMPLOYEE_APP_PATH = "/app";
export const EMPLOYEE_INVITATION_ACCEPT_PATH = "/accept-invitation";
export const EMPLOYEE_SIGN_IN_PATH = "/sign-in";
export const EMPLOYEE_SIGN_UP_PATH = "/sign-up";

export function applicationUrl(origin: string, path: string): string {
  const trustedOrigin = parseApplicationOrigin(origin);
  if (!path.startsWith("/")) {
    throw new Error("Application path must start with /");
  }
  return `${trustedOrigin}${path}`;
}

export function employeeInvitationRedirectUrl(origin: string): string {
  return applicationUrl(origin, EMPLOYEE_INVITATION_ACCEPT_PATH);
}

export function readApplicationOrigin(source: NodeJS.Dict<string> = process.env): string {
  return parseApplicationOrigin(source.APP_URL);
}

export type InvitationAcceptNavigation =
  | { kind: "redirect"; href: string }
  | { kind: "invalid" };

/**
 * Maps Clerk invitation ticket status onto MagicCRM routes.
 * Only Clerk ticket params are forwarded. Browser redirect_url is ignored.
 */
export function invitationAcceptNavigation(input: {
  clerkStatus: string | null | undefined;
  clerkTicket: string | null | undefined;
}): InvitationAcceptNavigation {
  const status = input.clerkStatus?.trim() ?? "";
  const ticket = input.clerkTicket?.trim() ?? "";

  if (status === "complete") {
    return { kind: "redirect", href: EMPLOYEE_APP_PATH };
  }

  if (!ticket) {
    return { kind: "invalid" };
  }

  const search = new URLSearchParams({
    __clerk_ticket: ticket,
    __clerk_status: status,
  }).toString();

  if (status === "sign_up") {
    return { kind: "redirect", href: `${EMPLOYEE_SIGN_UP_PATH}?${search}` };
  }

  if (status === "sign_in") {
    return { kind: "redirect", href: `${EMPLOYEE_SIGN_IN_PATH}?${search}` };
  }

  return { kind: "invalid" };
}
