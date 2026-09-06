import { describe, expect, it } from "vitest";

import { nextOnboardingStatus } from "@/server/team/onboarding-status";
import { ONBOARDING_STATUSES } from "@/types/team";

describe("tenant onboarding status", () => {
  it("moves a new client from provisioning to awaiting admin, then active", () => {
    const provisioning = nextOnboardingStatus(ONBOARDING_STATUSES.PROVISIONING, "provisioning_started");
    expect(provisioning).toBe(ONBOARDING_STATUSES.PROVISIONING);
    expect(nextOnboardingStatus(provisioning, "admin_invited")).toBe(ONBOARDING_STATUSES.AWAITING_ADMIN);
    expect(nextOnboardingStatus(ONBOARDING_STATUSES.AWAITING_ADMIN, "admin_accepted")).toBe(
      ONBOARDING_STATUSES.ACTIVE,
    );
  });

  it("keeps an already-active tenant active and retries failed onboarding", () => {
    expect(nextOnboardingStatus(ONBOARDING_STATUSES.ACTIVE, "admin_invited")).toBe(
      ONBOARDING_STATUSES.ACTIVE,
    );
    expect(nextOnboardingStatus(ONBOARDING_STATUSES.FAILED, "retry")).toBe(
      ONBOARDING_STATUSES.PROVISIONING,
    );
    expect(nextOnboardingStatus(ONBOARDING_STATUSES.PROVISIONING, "unrecoverable_failure")).toBe(
      ONBOARDING_STATUSES.FAILED,
    );
  });
});
