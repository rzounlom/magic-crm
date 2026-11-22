import { PERMISSIONS, type PermissionKey } from "@/types/permissions";

/**
 * Central employee navigation definition (UX3 → Phase 12C).
 * Visibility is enforced server-side before links render; this map is not authorization.
 */

export type EmployeeNavGroup = "primary" | "tools" | "settings";

export type EmployeeNavMobileSlot = "primary" | "more" | "none";

export type EmployeeNavItemId =
  | "overview"
  | "inquiries"
  | "bookings"
  | "schedule"
  | "salesKnowledge"
  | "resources"
  | "operatingHours"
  | "catalogSync"
  | "team"
  | "security";

export type EmployeeNavItem = {
  id: EmployeeNavItemId;
  href: string;
  label: string;
  group: EmployeeNavGroup;
  /** Null = always available when the employee shell loads (Home). */
  permission: PermissionKey | null;
  mobile: EmployeeNavMobileSlot;
  /** Order within the mobile primary bar (lower first). */
  mobilePrimaryOrder?: number;
};

export const EMPLOYEE_NAV_ITEMS: readonly EmployeeNavItem[] = [
  {
    id: "overview",
    href: "/app",
    label: "Home",
    group: "primary",
    permission: null,
    mobile: "primary",
    mobilePrimaryOrder: 0,
  },
  {
    id: "inquiries",
    href: "/app/inquiries",
    label: "Inquiries",
    group: "primary",
    permission: PERMISSIONS.CRM_INQUIRIES_VIEW,
    mobile: "primary",
    mobilePrimaryOrder: 1,
  },
  {
    id: "bookings",
    href: "/app/bookings",
    label: "Bookings",
    group: "primary",
    permission: PERMISSIONS.EVENTS_VIEW,
    mobile: "primary",
    mobilePrimaryOrder: 3,
  },
  {
    id: "schedule",
    href: "/app/schedule",
    label: "Schedule",
    group: "primary",
    permission: PERMISSIONS.CALENDAR_VIEW,
    mobile: "primary",
    mobilePrimaryOrder: 2,
  },
  {
    id: "salesKnowledge",
    href: "/app/admin/ai/knowledge",
    label: "Sales knowledge",
    group: "tools",
    permission: PERMISSIONS.AI_VIEW,
    mobile: "more",
  },
  {
    id: "resources",
    href: "/app/admin/resources",
    label: "Resources",
    group: "tools",
    permission: PERMISSIONS.INVENTORY_MANAGE,
    mobile: "more",
  },
  {
    id: "operatingHours",
    href: "/app/admin/operating-hours",
    label: "Hours",
    group: "settings",
    permission: PERMISSIONS.LOCATIONS_MANAGE,
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
    id: "catalogSync",
    href: "/app/admin/catalog-sync",
    label: "Catalog sync",
    group: "settings",
    permission: PERMISSIONS.CATALOG_MANAGE,
    mobile: "more",
  },
] as const;

export const EMPLOYEE_NAV_GROUP_LABELS: Record<EmployeeNavGroup, string> = {
  primary: "Primary",
  tools: "Tools",
  settings: "Settings",
};

/** Exact /app for Home; prefix match for nested module routes. */
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

/**
 * Mobile primary bar: Home, Inquiries, then Schedule if visible else Bookings.
 * Max three slots; remaining destinations go to More.
 */
export function mobilePrimaryNavItems(visibleIds: ReadonlySet<EmployeeNavItemId>): EmployeeNavItem[] {
  const visible = filterEmployeeNavItems(visibleIds);
  const byId = (id: EmployeeNavItemId) => visible.find((item) => item.id === id) ?? null;

  const slots: EmployeeNavItem[] = [];
  const home = byId("overview");
  if (home) {
    slots.push(home);
  }
  const inquiries = byId("inquiries");
  if (inquiries) {
    slots.push(inquiries);
  }
  const schedule = byId("schedule");
  const bookings = byId("bookings");
  if (schedule) {
    slots.push(schedule);
  } else if (bookings) {
    slots.push(bookings);
  }

  return slots.slice(0, 3);
}

export function mobileMoreNavItems(visibleIds: ReadonlySet<EmployeeNavItemId>): EmployeeNavItem[] {
  const primaryIds = new Set(mobilePrimaryNavItems(visibleIds).map((item) => item.id));
  return filterEmployeeNavItems(visibleIds).filter((item) => !primaryIds.has(item.id));
}

export function navItemsByGroup(
  visibleIds: ReadonlySet<EmployeeNavItemId>,
  group: EmployeeNavGroup,
): EmployeeNavItem[] {
  return filterEmployeeNavItems(visibleIds).filter((item) => item.group === group);
}
