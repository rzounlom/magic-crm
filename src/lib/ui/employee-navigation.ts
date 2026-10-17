import { PERMISSIONS, type PermissionKey } from "@/types/permissions";

/**
 * Central employee navigation definition (UX3).
 * Visibility is enforced server-side before links render; this map is not authorization.
 */

export type EmployeeNavGroup = "overview" | "bookingsEvents" | "catalog" | "settings";

export type EmployeeNavMobileSlot = "primary" | "more" | "none";

export type EmployeeNavItemId =
  | "overview"
  | "inquiries"
  | "bookings"
  | "schedule"
  | "salesKnowledge"
  | "resources"
  | "team"
  | "security"
  | "scenarioLab";

export type EmployeeNavItem = {
  id: EmployeeNavItemId;
  href: string;
  label: string;
  group: EmployeeNavGroup;
  /**
   * Null = not gated by a single permission key.
   * Overview is always visible; Scenario Lab uses a dedicated composite server gate.
   */
  permission: PermissionKey | null;
  mobile: EmployeeNavMobileSlot;
  /** Order within the mobile primary bar (lower first). */
  mobilePrimaryOrder?: number;
  /** Optional compact badge (display only — not authorization). */
  badge?: string;
};

export const EMPLOYEE_NAV_ITEMS: readonly EmployeeNavItem[] = [
  {
    id: "overview",
    href: "/app",
    label: "Overview",
    group: "overview",
    permission: null,
    mobile: "more",
  },
  {
    id: "inquiries",
    href: "/app/inquiries",
    label: "Inquiries",
    group: "bookingsEvents",
    permission: PERMISSIONS.CRM_INQUIRIES_VIEW,
    mobile: "primary",
    mobilePrimaryOrder: 1,
  },
  {
    id: "bookings",
    href: "/app/bookings",
    label: "Bookings",
    group: "bookingsEvents",
    permission: PERMISSIONS.EVENTS_VIEW,
    mobile: "primary",
    mobilePrimaryOrder: 3,
  },
  {
    id: "schedule",
    href: "/app/schedule",
    label: "Schedule",
    group: "bookingsEvents",
    permission: PERMISSIONS.CALENDAR_VIEW,
    mobile: "primary",
    mobilePrimaryOrder: 2,
  },
  {
    id: "salesKnowledge",
    href: "/app/admin/ai/knowledge",
    label: "Sales knowledge",
    group: "catalog",
    permission: PERMISSIONS.AI_VIEW,
    mobile: "more",
  },
  {
    id: "resources",
    href: "/app/admin/resources",
    label: "Resources",
    group: "catalog",
    permission: PERMISSIONS.INVENTORY_MANAGE,
    mobile: "more",
  },
  {
    id: "team",
    href: "/app/admin/team",
    label: "Team",
    group: "settings",
    permission: PERMISSIONS.USERS_VIEW,
    mobile: "more",
  },
  {
    id: "security",
    href: "/app/admin/security-groups",
    label: "Security",
    group: "settings",
    permission: PERMISSIONS.SECURITY_GROUPS_VIEW,
    mobile: "more",
  },
  {
    id: "scenarioLab",
    href: "/scenario-lab",
    label: "Scenario Lab",
    group: "settings",
    // Composite LAB1-A gate in loadEmployeeShellChrome — not a single permission.
    permission: null,
    mobile: "more",
    badge: "TEST",
  },
] as const;

export const EMPLOYEE_NAV_GROUP_LABELS: Record<EmployeeNavGroup, string> = {
  overview: "Overview",
  bookingsEvents: "Bookings & Events",
  catalog: "Catalog",
  settings: "Settings",
};

/** Exact /app for Overview; prefix match for nested module routes. */
export function isEmployeeNavActive(pathname: string, href: string): boolean {
  if (href === "/app") {
    return pathname === "/app";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function employeeNavItemById(id: EmployeeNavItemId): EmployeeNavItem {
  const item = EMPLOYEE_NAV_ITEMS.find((entry) => entry.id === id);
  if (!item) {
    throw new Error(`Unknown employee nav item: ${id}`);
  }
  return item;
}

export function filterEmployeeNavItems(
  visibleIds: ReadonlySet<EmployeeNavItemId>,
): EmployeeNavItem[] {
  return EMPLOYEE_NAV_ITEMS.filter((item) => visibleIds.has(item.id));
}

export function mobilePrimaryNavItems(visibleIds: ReadonlySet<EmployeeNavItemId>): EmployeeNavItem[] {
  return filterEmployeeNavItems(visibleIds)
    .filter((item) => item.mobile === "primary")
    .sort((a, b) => (a.mobilePrimaryOrder ?? 99) - (b.mobilePrimaryOrder ?? 99));
}

export function mobileMoreNavItems(visibleIds: ReadonlySet<EmployeeNavItemId>): EmployeeNavItem[] {
  return filterEmployeeNavItems(visibleIds).filter((item) => item.mobile === "more");
}
