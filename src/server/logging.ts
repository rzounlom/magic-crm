type TenantLogEvent =
  | "organization_provisioning_started"
  | "organization_provisioned"
  | "organization_reused"
  | "user_profile_provisioned"
  | "user_profile_reused"
  | "tenant_mapping_failure"
  | "administrator_bootstrapped"
  | "employee_identity_refresh_failed";

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
