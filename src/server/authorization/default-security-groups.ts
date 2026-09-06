import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  type PermissionKey,
} from "@/types/permissions";

export const SYSTEM_GROUP_KEYS = {
  ADMINISTRATORS: "administrators",
  EVENT_SALES: "event_sales",
  FRONT_DESK: "front_desk",
  OPERATIONS: "operations",
  ACCOUNTING_MANAGERS: "accounting_managers",
} as const;

export type SystemGroupKey = (typeof SYSTEM_GROUP_KEYS)[keyof typeof SYSTEM_GROUP_KEYS];

export type DefaultSecurityGroupDefinition = {
  systemKey: SystemGroupKey;
  name: string;
  description: string;
  isSystem: true;
  permissionKeys: readonly PermissionKey[];
};

export const DEFAULT_SECURITY_GROUPS: readonly DefaultSecurityGroupDefinition[] = [
  {
    systemKey: SYSTEM_GROUP_KEYS.ADMINISTRATORS,
    name: "Administrators",
    description: "Full tenant administration. At least one member must remain.",
    isSystem: true,
    permissionKeys: ALL_PERMISSION_KEYS,
  },
  {
    systemKey: SYSTEM_GROUP_KEYS.EVENT_SALES,
    name: "Event Sales",
    description: "Customers, inquiries, events, calendar, and communications. No user administration.",
    isSystem: true,
    permissionKeys: [
      PERMISSIONS.CRM_INQUIRIES_VIEW,
      PERMISSIONS.CRM_INQUIRIES_MANAGE,
      PERMISSIONS.CRM_CUSTOMERS_VIEW,
      PERMISSIONS.CRM_CUSTOMERS_MANAGE,
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.EVENTS_EDIT,
      PERMISSIONS.EVENTS_CONFIRM,
      PERMISSIONS.EVENTS_CANCEL,
      PERMISSIONS.CALENDAR_VIEW,
      PERMISSIONS.COMMUNICATIONS_VIEW,
      PERMISSIONS.COMMUNICATIONS_SEND,
      PERMISSIONS.AI_VIEW,
    ],
  },
  {
    systemKey: SYSTEM_GROUP_KEYS.FRONT_DESK,
    name: "Front Desk",
    description: "POS, customer lookup, limited events, and permitted payment collection.",
    isSystem: true,
    permissionKeys: [
      PERMISSIONS.POS_ACCESS,
      PERMISSIONS.POS_DISCOUNT,
      PERMISSIONS.POS_CASH_PAYMENT,
      PERMISSIONS.CRM_CUSTOMERS_VIEW,
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.CALENDAR_VIEW,
      PERMISSIONS.PAYMENTS_COLLECT,
    ],
  },
  {
    systemKey: SYSTEM_GROUP_KEYS.OPERATIONS,
    name: "Operations",
    description: "Today’s events, calendar, waivers, and inventory view.",
    isSystem: true,
    permissionKeys: [
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.CALENDAR_VIEW,
      PERMISSIONS.WAIVERS_VIEW,
      PERMISSIONS.WAIVERS_MANAGE,
      PERMISSIONS.INVENTORY_VIEW,
    ],
  },
  {
    systemKey: SYSTEM_GROUP_KEYS.ACCOUNTING_MANAGERS,
    name: "Accounting / Managers",
    description: "Payments, refunds, and reports.",
    isSystem: true,
    permissionKeys: [
      PERMISSIONS.PAYMENTS_VIEW,
      PERMISSIONS.PAYMENTS_REFUND,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
];

export function defaultGroupBySystemKey(systemKey: SystemGroupKey): DefaultSecurityGroupDefinition {
  const group = DEFAULT_SECURITY_GROUPS.find((entry) => entry.systemKey === systemKey);
  if (!group) {
    throw new Error(`Unknown default security group: ${systemKey}`);
  }
  return group;
}
