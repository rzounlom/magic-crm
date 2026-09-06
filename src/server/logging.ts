type SalesAgentLogEvent =
  | "sales_agent_turn_failed"
  | "sales_agent_tool_failed"
  | "sales_agent_empty_output"
  | "sales_agent_handoff_declined";

type TenantLogEvent =
  | "organization_provisioning_started"
  | "organization_provisioned"
  | "organization_reused"
  | "user_profile_provisioned"
  | "user_profile_reused"
  | "tenant_mapping_failure"
  | "administrator_bootstrapped"
  | "employee_identity_refresh_failed"
  | "team_invitation_applied"
  | "team_invitation_reconciled"
  | "team_invitation_clerk_failure"
  | "client_tenant_provisioning_started"
  | "client_tenant_provisioned"
  | "client_tenant_reused";

export function logTenantEvent(
  event: TenantLogEvent,
  fields: {
    clerkOrganizationId?: string;
    outcome?: string;
    operation?: string;
    teamInvitationId?: string;
    clerkInvitationId?: string;
    clerkErrorCode?: string;
    httpStatus?: number;
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

export function logSalesAgentEvent(
  event: SalesAgentLogEvent,
  fields: {
    inquiryId?: string;
    conversationId?: string;
    responseId?: string | null;
    model?: string;
    failureCategory?: string;
    httpStatus?: number | null;
    toolName?: string;
    latencyMs?: number;
    explicitHandoff?: boolean;
  } = {},
): void {
  console.info(
    JSON.stringify({
      scope: "magiccrm.sales_agent",
      event,
      ...fields,
    }),
  );
}
