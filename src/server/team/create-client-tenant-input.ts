import { TeamManagementError } from "@/server/errors";
import { isValidInvitationEmail, normalizeInvitationEmail } from "@/server/team/invitation-email";

const NAME_MAX = 80;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export type CreateClientTenantInput = {
  organizationName: string;
  adminEmail: string;
  timezone?: string;
  currency?: string;
};

export type ValidatedCreateClientTenantInput = {
  organizationName: string;
  adminEmail: string;
  emailNormalized: string;
  timezone: string;
  currency: string;
};

function supportedTimeZones(): Set<string> {
  const intlWithValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  if (typeof intlWithValues.supportedValuesOf === "function") {
    return new Set(intlWithValues.supportedValuesOf("timeZone"));
  }
  return new Set(["UTC"]);
}

export function isSupportedTimezone(value: string): boolean {
  const timezone = value.trim();
  if (timezone === "UTC") {
    return true;
  }
  return supportedTimeZones().has(timezone);
}

export function isSupportedCurrency(value: string): boolean {
  return CURRENCY_PATTERN.test(value.trim().toUpperCase());
}

export function validateCreateClientTenantInput(
  input: CreateClientTenantInput,
): ValidatedCreateClientTenantInput {
  const organizationName = input.organizationName.trim();
  if (organizationName.length < 2 || organizationName.length > NAME_MAX) {
    throw new TeamManagementError("CLIENT_TENANT_VALIDATION");
  }

  if (!isValidInvitationEmail(input.adminEmail)) {
    throw new TeamManagementError("INVALID_INVITATION_EMAIL");
  }

  const timezone = (input.timezone ?? "UTC").trim() || "UTC";
  if (!isSupportedTimezone(timezone)) {
    throw new TeamManagementError("CLIENT_TENANT_VALIDATION");
  }

  const currency = (input.currency ?? "USD").trim().toUpperCase() || "USD";
  if (!isSupportedCurrency(currency)) {
    throw new TeamManagementError("CLIENT_TENANT_VALIDATION");
  }

  return {
    organizationName,
    adminEmail: input.adminEmail.trim(),
    emailNormalized: normalizeInvitationEmail(input.adminEmail),
    timezone,
    currency,
  };
}
