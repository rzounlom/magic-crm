import { describe, expect, it } from "vitest";

import {
  ApplicationUrlError,
  employeeInvitationRedirectUrl,
  invitationAcceptNavigation,
  parseApplicationOrigin,
} from "@/lib/auth/application-url";

describe("parseApplicationOrigin", () => {
  it("accepts localhost http and production https", () => {
    expect(parseApplicationOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(parseApplicationOrigin("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
    expect(parseApplicationOrigin("https://crm.example.com")).toBe("https://crm.example.com");
  });

  it("rejects malformed, credentialed, and non-local http origins", () => {
    expect(() => parseApplicationOrigin("")).toThrow(ApplicationUrlError);
    expect(() => parseApplicationOrigin("localhost:3000")).toThrow(ApplicationUrlError);
    expect(() => parseApplicationOrigin("http://example.com")).toThrow(ApplicationUrlError);
    expect(() => parseApplicationOrigin("https://user:pass@crm.example.com")).toThrow(
      ApplicationUrlError,
    );
    expect(() => parseApplicationOrigin("https://crm.example.com/app")).toThrow(ApplicationUrlError);
    expect(() => parseApplicationOrigin("https://crm.example.com?next=https://evil.test")).toThrow(
      ApplicationUrlError,
    );
  });
});

describe("employeeInvitationRedirectUrl", () => {
  it("builds the accept-invitation URL from trusted origin only", () => {
    expect(employeeInvitationRedirectUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/accept-invitation",
    );
    expect(employeeInvitationRedirectUrl("https://crm.example.com")).toBe(
      "https://crm.example.com/accept-invitation",
    );
  });
});

describe("invitationAcceptNavigation", () => {
  it("sends existing users to sign-in and new users to sign-up with the Clerk ticket", () => {
    expect(
      invitationAcceptNavigation({ clerkStatus: "sign_in", clerkTicket: "ticket_existing" }),
    ).toEqual({
      kind: "redirect",
      href: "/sign-in?__clerk_ticket=ticket_existing&__clerk_status=sign_in",
    });
    expect(
      invitationAcceptNavigation({ clerkStatus: "sign_up", clerkTicket: "ticket_new" }),
    ).toEqual({
      kind: "redirect",
      href: "/sign-up?__clerk_ticket=ticket_new&__clerk_status=sign_up",
    });
  });

  it("sends an already-completed ticket into /app and ignores extra browser redirect params", () => {
    expect(invitationAcceptNavigation({ clerkStatus: "complete", clerkTicket: "ticket" })).toEqual({
      kind: "redirect",
      href: "/app",
    });
    expect(invitationAcceptNavigation({ clerkStatus: "sign_in", clerkTicket: "" })).toEqual({
      kind: "invalid",
    });
    expect(invitationAcceptNavigation({ clerkStatus: "unknown", clerkTicket: "ticket" })).toEqual({
      kind: "invalid",
    });
  });
});
