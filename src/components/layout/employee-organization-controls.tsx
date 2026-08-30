"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import { clerkAppearance } from "@/lib/auth/clerk-appearance";

export function EmployeeOrganizationControls() {
  return (
    <div className="flex items-center gap-3">
      <OrganizationSwitcher
        hidePersonal
        afterCreateOrganizationUrl="/app"
        afterSelectOrganizationUrl="/app"
        appearance={clerkAppearance}
      />
      <UserButton appearance={clerkAppearance} />
    </div>
  );
}
