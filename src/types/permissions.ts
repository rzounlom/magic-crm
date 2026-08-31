export const PERMISSIONS = {
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  SECURITY_GROUPS_VIEW: "security_groups.view",
  SECURITY_GROUPS_MANAGE: "security_groups.manage",
  ORGANIZATION_SETTINGS_VIEW: "organization.settings.view",
  ORGANIZATION_SETTINGS_MANAGE: "organization.settings.manage",
  LOCATIONS_VIEW: "locations.view",
  LOCATIONS_MANAGE: "locations.manage",
  CRM_INQUIRIES_VIEW: "crm.inquiries.view",
  CRM_INQUIRIES_MANAGE: "crm.inquiries.manage",
  CRM_CUSTOMERS_VIEW: "crm.customers.view",
  CRM_CUSTOMERS_MANAGE: "crm.customers.manage",
  EVENTS_VIEW: "events.view",
  EVENTS_CREATE: "events.create",
  EVENTS_EDIT: "events.edit",
  EVENTS_CONFIRM: "events.confirm",
  EVENTS_CANCEL: "events.cancel",
  CALENDAR_VIEW: "calendar.view",
  CATALOG_VIEW: "catalog.view",
  CATALOG_MANAGE: "catalog.manage",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE: "inventory.manage",
  INVENTORY_OVERRIDE: "inventory.override",
  POS_ACCESS: "pos.access",
  POS_DISCOUNT: "pos.discount",
  POS_REFUND: "pos.refund",
  POS_CASH_PAYMENT: "pos.cash_payment",
  PAYMENTS_VIEW: "payments.view",
  PAYMENTS_COLLECT: "payments.collect",
  PAYMENTS_REFUND: "payments.refund",
  WAIVERS_VIEW: "waivers.view",
  WAIVERS_MANAGE: "waivers.manage",
  COMMUNICATIONS_VIEW: "communications.view",
  COMMUNICATIONS_SEND: "communications.send",
  COMMUNICATIONS_MANAGE_AUTOMATION: "communications.manage_automation",
  REPORTS_VIEW: "reports.view",
  INTEGRATIONS_VIEW: "integrations.view",
  INTEGRATIONS_MANAGE: "integrations.manage",
  AI_VIEW: "ai.view",
  AI_MANAGE: "ai.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type PermissionCatalogEntry = {
  key: PermissionKey;
  module: string;
  name: string;
  description: string;
};

const CATALOG: readonly PermissionCatalogEntry[] = [
  { key: PERMISSIONS.USERS_VIEW, module: "users", name: "View users", description: "See employees in this organization." },
  { key: PERMISSIONS.USERS_MANAGE, module: "users", name: "Manage users", description: "Change employee profiles in this organization." },
  { key: PERMISSIONS.SECURITY_GROUPS_VIEW, module: "security_groups", name: "View security groups", description: "See security groups and their members." },
  { key: PERMISSIONS.SECURITY_GROUPS_MANAGE, module: "security_groups", name: "Manage security groups", description: "Create groups, change permissions, and assign employees." },
  { key: PERMISSIONS.ORGANIZATION_SETTINGS_VIEW, module: "organization", name: "View organization settings", description: "See organization settings." },
  { key: PERMISSIONS.ORGANIZATION_SETTINGS_MANAGE, module: "organization", name: "Manage organization settings", description: "Change organization settings." },
  { key: PERMISSIONS.LOCATIONS_VIEW, module: "locations", name: "View locations", description: "See locations in this organization." },
  { key: PERMISSIONS.LOCATIONS_MANAGE, module: "locations", name: "Manage locations", description: "Create and update locations." },
  { key: PERMISSIONS.CRM_INQUIRIES_VIEW, module: "crm", name: "View inquiries", description: "See sales inquiries." },
  { key: PERMISSIONS.CRM_INQUIRIES_MANAGE, module: "crm", name: "Manage inquiries", description: "Create and update sales inquiries." },
  { key: PERMISSIONS.CRM_CUSTOMERS_VIEW, module: "crm", name: "View customers", description: "See customer records." },
  { key: PERMISSIONS.CRM_CUSTOMERS_MANAGE, module: "crm", name: "Manage customers", description: "Create and update customer records." },
  { key: PERMISSIONS.EVENTS_VIEW, module: "events", name: "View events", description: "See event bookings." },
  { key: PERMISSIONS.EVENTS_CREATE, module: "events", name: "Create events", description: "Create event bookings." },
  { key: PERMISSIONS.EVENTS_EDIT, module: "events", name: "Edit events", description: "Update event bookings." },
  { key: PERMISSIONS.EVENTS_CONFIRM, module: "events", name: "Confirm events", description: "Confirm event bookings." },
  { key: PERMISSIONS.EVENTS_CANCEL, module: "events", name: "Cancel events", description: "Cancel event bookings." },
  { key: PERMISSIONS.CALENDAR_VIEW, module: "calendar", name: "View calendar", description: "See the event calendar." },
  { key: PERMISSIONS.CATALOG_VIEW, module: "catalog", name: "View catalog", description: "See packages and attractions." },
  { key: PERMISSIONS.CATALOG_MANAGE, module: "catalog", name: "Manage catalog", description: "Change packages and attractions." },
  { key: PERMISSIONS.INVENTORY_VIEW, module: "inventory", name: "View inventory", description: "See attraction inventory." },
  { key: PERMISSIONS.INVENTORY_MANAGE, module: "inventory", name: "Manage inventory", description: "Change attraction inventory." },
  { key: PERMISSIONS.INVENTORY_OVERRIDE, module: "inventory", name: "Override inventory", description: "Override inventory holds." },
  { key: PERMISSIONS.POS_ACCESS, module: "pos", name: "POS access", description: "Use the point of sale." },
  { key: PERMISSIONS.POS_DISCOUNT, module: "pos", name: "POS discount", description: "Apply POS discounts." },
  { key: PERMISSIONS.POS_REFUND, module: "pos", name: "POS refund", description: "Issue POS refunds." },
  { key: PERMISSIONS.POS_CASH_PAYMENT, module: "pos", name: "POS cash payment", description: "Take cash at POS." },
  { key: PERMISSIONS.PAYMENTS_VIEW, module: "payments", name: "View payments", description: "See payment records." },
  { key: PERMISSIONS.PAYMENTS_COLLECT, module: "payments", name: "Collect payments", description: "Collect permitted payments." },
  { key: PERMISSIONS.PAYMENTS_REFUND, module: "payments", name: "Refund payments", description: "Issue payment refunds." },
  { key: PERMISSIONS.WAIVERS_VIEW, module: "waivers", name: "View waivers", description: "See waiver records." },
  { key: PERMISSIONS.WAIVERS_MANAGE, module: "waivers", name: "Manage waivers", description: "Change waiver settings and records." },
  { key: PERMISSIONS.COMMUNICATIONS_VIEW, module: "communications", name: "View communications", description: "See messages and templates." },
  { key: PERMISSIONS.COMMUNICATIONS_SEND, module: "communications", name: "Send communications", description: "Send customer messages." },
  { key: PERMISSIONS.COMMUNICATIONS_MANAGE_AUTOMATION, module: "communications", name: "Manage communication automation", description: "Change automated messaging." },
  { key: PERMISSIONS.REPORTS_VIEW, module: "reports", name: "View reports", description: "See organization reports." },
  { key: PERMISSIONS.INTEGRATIONS_VIEW, module: "integrations", name: "View integrations", description: "See integration settings." },
  { key: PERMISSIONS.INTEGRATIONS_MANAGE, module: "integrations", name: "Manage integrations", description: "Change integration settings." },
  { key: PERMISSIONS.AI_VIEW, module: "ai", name: "View AI", description: "See AI sales tools." },
  { key: PERMISSIONS.AI_MANAGE, module: "ai", name: "Manage AI", description: "Change AI sales settings." },
];

export const PERMISSION_CATALOG: readonly PermissionCatalogEntry[] = CATALOG;

const PERMISSION_KEY_SET = new Set<string>(CATALOG.map((entry) => entry.key));

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEY_SET.has(value);
}

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = CATALOG.map((entry) => entry.key);

export const REQUIRED_ADMIN_PERMISSIONS = [
  PERMISSIONS.USERS_VIEW,
  PERMISSIONS.USERS_MANAGE,
  PERMISSIONS.SECURITY_GROUPS_VIEW,
  PERMISSIONS.SECURITY_GROUPS_MANAGE,
  PERMISSIONS.ORGANIZATION_SETTINGS_VIEW,
  PERMISSIONS.ORGANIZATION_SETTINGS_MANAGE,
  PERMISSIONS.LOCATIONS_VIEW,
  PERMISSIONS.LOCATIONS_MANAGE,
] as const satisfies readonly PermissionKey[];
