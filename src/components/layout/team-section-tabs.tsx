import Link from "next/link";

type TeamSectionTabsProps = {
  active: "employees" | "invitations";
  canManage: boolean;
};

export function TeamSectionTabs({ active, canManage }: TeamSectionTabsProps) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
      <nav className="flex gap-4 text-sm" aria-label="Team sections">
        <Link
          href="/app/admin/team"
          className={active === "employees" ? "font-medium text-foreground" : "text-primary"}
          aria-current={active === "employees" ? "page" : undefined}
        >
          Employees
        </Link>
        <Link
          href="/app/admin/team/invitations"
          className={active === "invitations" ? "font-medium text-foreground" : "text-primary"}
          aria-current={active === "invitations" ? "page" : undefined}
        >
          Pending invitations
        </Link>
      </nav>
      {canManage ? (
        <Link
          href="/app/admin/team/invite"
          className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Invite employee
        </Link>
      ) : null}
    </div>
  );
}
