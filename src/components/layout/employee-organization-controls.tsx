"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import { clerkAppearance } from "@/lib/auth/clerk-appearance";

const organizationSwitcherAppearance = {
  ...clerkAppearance,
  elements: {
    /**
     * Clerk 7.8.3 OrganizationSwitcher has no hideCreateOrganization prop.
     * Appearance is the supported way to hide the create action in employee UX.
     * Tenant creation remains Clerk Dashboard / platform-controlled.
     */
    organizationSwitcherPopoverActionButton__createOrganization: { display: "none" },
    organizationSwitcherPopoverActionButtonIcon__createOrganization: { display: "none" },
  },
};

export function EmployeeOrganizationControls() {
  return (
    <div className="flex items-center gap-3">
      <OrganizationSwitcher
        hidePersonal
        afterSelectOrganizationUrl="/app"
        appearance={organizationSwitcherAppearance}
      />
      <UserButton appearance={clerkAppearance} />
    </div>
  );
}
