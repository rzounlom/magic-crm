import { ONBOARDING_STATUSES, type OnboardingStatus } from "@/types/team";

const STATUS_SET = new Set<string>(Object.values(ONBOARDING_STATUSES));

export function isOnboardingStatus(value: string): value is OnboardingStatus {
  return STATUS_SET.has(value);
}

export function parseOnboardingStatus(value: string | null | undefined): OnboardingStatus {
  if (value && isOnboardingStatus(value)) {
    return value;
  }
  return ONBOARDING_STATUSES.ACTIVE;
}

export type OnboardingEvent =
  | "provisioning_started"
  | "admin_invited"
  | "admin_accepted"
  | "unrecoverable_failure"
  | "retry";

export function nextOnboardingStatus(
  current: OnboardingStatus,
  event: OnboardingEvent,
): OnboardingStatus {
  switch (event) {
    case "provisioning_started":
      return current === ONBOARDING_STATUSES.ACTIVE ? ONBOARDING_STATUSES.ACTIVE : ONBOARDING_STATUSES.PROVISIONING;
    case "admin_invited":
      return current === ONBOARDING_STATUSES.ACTIVE ? ONBOARDING_STATUSES.ACTIVE : ONBOARDING_STATUSES.AWAITING_ADMIN;
    case "admin_accepted":
      return ONBOARDING_STATUSES.ACTIVE;
    case "unrecoverable_failure":
      return ONBOARDING_STATUSES.FAILED;
    case "retry":
      return current === ONBOARDING_STATUSES.FAILED
        ? ONBOARDING_STATUSES.PROVISIONING
        : current;
  }
}
