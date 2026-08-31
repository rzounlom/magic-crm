export function SecurityAuthorizationNote({
  administrators = false,
}: {
  administrators?: boolean;
}) {
  return (
    <div className="mt-4 max-w-xl space-y-2 text-sm text-foreground/70">
      <p>
        Clerk organization roles control Clerk organization administration. MagicCRM Security Groups
        control application access.
      </p>
      {administrators ? (
        <p>
          After the first MagicCRM Administrator is set, other Clerk organization admins are not added
          automatically. Add employees to Administrators to grant Security access.
        </p>
      ) : null}
    </div>
  );
}
