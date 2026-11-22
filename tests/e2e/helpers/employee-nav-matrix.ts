import type { E2ERole } from "./e2e-auth";

export type EmployeeNavExpectation = {
  label: string;
  href: string;
  visible: boolean;
};

/**
 * Expected employee shell visibility from default system groups.
 * Keep aligned with EMPLOYEE_NAV_ITEMS + DEFAULT_SECURITY_GROUPS — do not expand permissions.
 */
export const EMPLOYEE_NAV_BY_ROLE: Record<E2ERole, EmployeeNavExpectation[]> = {
  administrator: [
    { label: "Home", href: "/app", visible: true },
    { label: "Inquiries", href: "/app/inquiries", visible: true },
    { label: "Bookings", href: "/app/bookings", visible: true },
    { label: "Schedule", href: "/app/schedule", visible: true },
    { label: "Sales knowledge", href: "/app/admin/ai/knowledge", visible: true },
    { label: "Resources", href: "/app/admin/resources", visible: true },
    { label: "Hours", href: "/app/admin/operating-hours", visible: true },
    { label: "Team", href: "/app/admin/team", visible: true },
    { label: "Security", href: "/app/admin/security-groups", visible: true },
    { label: "Catalog sync", href: "/app/admin/catalog-sync", visible: true },
  ],
  event_sales: [
    { label: "Home", href: "/app", visible: true },
    { label: "Inquiries", href: "/app/inquiries", visible: true },
    { label: "Bookings", href: "/app/bookings", visible: true },
    { label: "Schedule", href: "/app/schedule", visible: true },
    { label: "Sales knowledge", href: "/app/admin/ai/knowledge", visible: true },
    { label: "Resources", href: "/app/admin/resources", visible: false },
    { label: "Hours", href: "/app/admin/operating-hours", visible: false },
    { label: "Team", href: "/app/admin/team", visible: false },
    { label: "Security", href: "/app/admin/security-groups", visible: false },
    { label: "Catalog sync", href: "/app/admin/catalog-sync", visible: false },
  ],
  front_desk: [
    { label: "Home", href: "/app", visible: true },
    { label: "Inquiries", href: "/app/inquiries", visible: false },
    { label: "Bookings", href: "/app/bookings", visible: true },
    { label: "Schedule", href: "/app/schedule", visible: true },
    { label: "Sales knowledge", href: "/app/admin/ai/knowledge", visible: false },
    { label: "Resources", href: "/app/admin/resources", visible: false },
    { label: "Hours", href: "/app/admin/operating-hours", visible: false },
    { label: "Team", href: "/app/admin/team", visible: false },
    { label: "Security", href: "/app/admin/security-groups", visible: false },
    { label: "Catalog sync", href: "/app/admin/catalog-sync", visible: false },
  ],
};

/** Routes Front Desk / Event Sales must not load as full modules (permission panel OK). */
export const DENIED_DIRECT_ROUTES_BY_ROLE: Record<E2ERole, string[]> = {
  administrator: [],
  event_sales: [
    "/app/admin/resources",
    "/app/admin/operating-hours",
    "/app/admin/team",
    "/app/admin/security-groups",
    "/app/admin/catalog-sync",
  ],
  front_desk: [
    "/app/inquiries",
    "/app/admin/ai/knowledge",
    "/app/admin/resources",
    "/app/admin/operating-hours",
    "/app/admin/team",
    "/app/admin/security-groups",
    "/app/admin/catalog-sync",
  ],
};

export const PERMISSION_DENIED_PATTERN =
  /don't have permission|permission to perform this action|You don't have permission/i;
