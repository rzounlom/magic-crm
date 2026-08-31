export type DestructiveConfirmCopy = {
  title: string;
  description: string;
  warning?: string;
  confirmLabel: string;
  cancelLabel?: string;
};

export function removeSecurityMemberConfirm(input: {
  isAdministrators: boolean;
  memberLabel: string;
  groupName: string;
}): DestructiveConfirmCopy {
  if (input.isAdministrators) {
    return {
      title: "Remove administrator?",
      description: `Remove ${input.memberLabel} from ${input.groupName}?`,
      warning: "Removing this employee may revoke administrative access to MagicCRM.",
      confirmLabel: "Remove member",
    };
  }

  return {
    title: "Remove member?",
    description: `Remove ${input.memberLabel} from ${input.groupName}?`,
    warning: "They may immediately lose access granted by this group.",
    confirmLabel: "Remove member",
  };
}

export function deleteSecurityGroupConfirm(groupName: string): DestructiveConfirmCopy {
  return {
    title: `Delete "${groupName}"?`,
    description:
      "Employees in this group will remain in MagicCRM, but permissions granted by this group will be removed.",
    warning: "The group and its permission assignments will be deleted. Employees themselves will not be deleted.",
    confirmLabel: "Delete group",
  };
}
