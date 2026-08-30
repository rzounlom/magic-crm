type TenantLogEvent =
  | "organization_provisioning_started"
  | "organization_provisioned"
  | "organization_reused"
  | "user_profile_provisioned"
  | "user_profile_reused"
  | "tenant_mapping_failure";

export function logTenantEvent(
  event: TenantLogEvent,
  fields: {
    clerkOrganizationId?: string;
    outcome?: string;
  } = {},
): void {
  console.info(
    JSON.stringify({
      scope: "magiccrm.tenant",
      event,
      ...fields,
    }),
  );
}
