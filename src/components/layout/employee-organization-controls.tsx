"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import { clerkAppearance } from "@/lib/auth/clerk-appearance";

const organizationSwitcherAppearance = {
  ...clerkAppearance,
  elements: {
    organizationSwitcherTrigger: {
      cursor: "pointer",
      maxWidth: "100%",
    },
    organizationPreview: {
      maxWidth: "100%",
    },
    organizationPreviewTextContainer: {
      minWidth: 0,
      overflow: "hidden",
    },
    organizationPreviewMainIdentifier: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    /**
     * Clerk 7.8.3 OrganizationSwitcher has no hideCreateOrganization prop.
     * Appearance is the supported way to hide the create action in employee UX.
     * Tenant creation remains Clerk Dashboard / platform-controlled.
     */
    organizationSwitcherPopoverActionButton__createOrganization: { display: "none" },
    organizationSwitcherPopoverActionButtonIcon__createOrganization: { display: "none" },
  },
};

const userButtonAppearance = {
  ...clerkAppearance,
  elements: {
    userButtonBox: {
      flexShrink: "0",
    },
    userButtonTrigger: {
      cursor: "pointer",
    },
    userButtonAvatarBox: {
      width: "1.75rem",
      height: "1.75rem",
    },
  },
};

export function EmployeeOrganizationSwitcher() {
  return (
    <OrganizationSwitcher
      hidePersonal
      afterSelectOrganizationUrl="/app"
      appearance={organizationSwitcherAppearance}
    />
  );
}

export function EmployeeUserButton() {
  return <UserButton appearance={userButtonAppearance} />;
}
