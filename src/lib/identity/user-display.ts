export type UserIdentitySnapshot = {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type UserDisplayFields = {
  clerkUserId: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
};

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveUserDisplayName(profile: UserDisplayFields): string | null {
  const displayName = trimToNull(profile.displayName);
  if (displayName) {
    return displayName;
  }

  const firstName = trimToNull(profile.firstName);
  const lastName = trimToNull(profile.lastName);
  const combined = [firstName, lastName].filter(Boolean).join(" ");
  return combined ? combined : null;
}

export function formatUserDisplayLabel(profile: UserDisplayFields): string {
  const name = resolveUserDisplayName(profile);
  const email = trimToNull(profile.email);

  if (name && email) {
    return `${name} — ${email}`;
  }
  if (email) {
    return email;
  }
  if (name) {
    return name;
  }
  return "Unknown employee";
}

export function userIdentitySearchText(profile: UserDisplayFields): string {
  return [resolveUserDisplayName(profile), trimToNull(profile.email), profile.clerkUserId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function needsIdentitySync(profile: {
  displayName: string | null;
  email: string | null;
}): boolean {
  return !trimToNull(profile.displayName) && !trimToNull(profile.email);
}

export function snapshotFromClerkUser(user: {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
}): UserIdentitySnapshot {
  const firstName = trimToNull(user.firstName);
  const lastName = trimToNull(user.lastName);
  const displayName = trimToNull(user.fullName) ?? ([firstName, lastName].filter(Boolean).join(" ") || null);

  return {
    firstName,
    lastName,
    displayName,
    email: trimToNull(user.primaryEmailAddress?.emailAddress),
    avatarUrl: trimToNull(user.imageUrl),
  };
}

export function snapshotFromBackendClerkUser(user: {
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
}): UserIdentitySnapshot {
  const primary =
    user.emailAddresses.find((row) => row.id === user.primaryEmailAddressId) ??
    user.emailAddresses[0] ??
    null;

  return snapshotFromClerkUser({
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: null,
    imageUrl: user.imageUrl,
    primaryEmailAddress: primary ? { emailAddress: primary.emailAddress } : null,
  });
}

export function hasIdentitySnapshot(snapshot: UserIdentitySnapshot): boolean {
  return Boolean(
    snapshot.firstName || snapshot.lastName || snapshot.displayName || snapshot.email || snapshot.avatarUrl,
  );
}
