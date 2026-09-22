export type DestructiveConfirmCopy = {
  title: string;
  description: string;
  warning?: string;
  confirmLabel: string;
  confirmPendingLabel?: string;
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

export function revokeInvitationConfirm(email: string): DestructiveConfirmCopy {
  return {
    title: "Revoke invitation?",
    description: `Revoke the invitation for ${email}?`,
    warning: "This invitation will no longer be usable.",
    confirmLabel: "Revoke invitation",
  };
}

export function sendNewInvitationConfirm(email: string): DestructiveConfirmCopy {
  return {
    title: "Send a new invitation?",
    description: `Send a new invitation to ${email}?`,
    warning: "The previous invitation will no longer be usable.",
    confirmLabel: "Send new invitation",
  };
}

export function cancelConfirmedBookingConfirm(): DestructiveConfirmCopy {
  return {
    title: "Cancel this booking?",
    description:
      "This will cancel the booking and release its future reserved resources on the Master Schedule. Historical booking information will be kept.",
    confirmLabel: "Cancel booking",
    confirmPendingLabel: "Cancelling…",
  };
}

export function cancelPendingBookingConfirm(): DestructiveConfirmCopy {
  return {
    title: "Cancel this booking request?",
    description: "This booking is not confirmed and does not currently reserve resources.",
    confirmLabel: "Cancel booking",
    confirmPendingLabel: "Cancelling…",
  };
}

export function archiveInquiryConfirm(input: {
  bookingNumber?: string | null;
  bookingStatus?: string | null;
}): DestructiveConfirmCopy {
  const activeBooking =
    input.bookingStatus === "PENDING_PAYMENT" || input.bookingStatus === "CONFIRMED";
  return {
    title: "Archive this inquiry?",
    description: "It will be removed from the active inquiry queue but its history will be kept.",
    warning: activeBooking
      ? `Booking ${input.bookingNumber ?? "on this inquiry"} remains ${input.bookingStatus === "CONFIRMED" ? "confirmed" : "pending"} and is not cancelled.`
      : undefined,
    confirmLabel: "Archive inquiry",
    confirmPendingLabel: "Archiving…",
  };
}

export function unarchiveInquiryConfirm(): DestructiveConfirmCopy {
  return {
    title: "Restore this inquiry?",
    description: "It will return to the active inquiry queue based on its current status.",
    confirmLabel: "Restore inquiry",
    confirmPendingLabel: "Restoring…",
  };
}
