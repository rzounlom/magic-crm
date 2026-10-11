import { ButtonLink } from "@/components/ui/button";

type TeamSectionTabsProps = {
  active: "employees" | "invitations";
  canManage: boolean;
};

export function TeamSectionTabs({ active, canManage }: TeamSectionTabsProps) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
      <nav
        className="flex min-h-11 flex-wrap items-center gap-1 rounded-full bg-muted p-1 text-sm"
        aria-label="Team sections"
        data-team-section-tabs
      >
        <ButtonLink
          href="/app/admin/team"
          variant={active === "employees" ? "secondary" : "ghost"}
          size="sm"
          className={
            active === "employees"
              ? "rounded-full bg-surface shadow-sm"
              : "rounded-full text-muted-foreground hover:text-foreground"
          }
          aria-current={active === "employees" ? "page" : undefined}
        >
          Employees
        </ButtonLink>
        <ButtonLink
          href="/app/admin/team/invitations"
          variant={active === "invitations" ? "secondary" : "ghost"}
          size="sm"
          className={
            active === "invitations"
              ? "rounded-full bg-surface shadow-sm"
              : "rounded-full text-muted-foreground hover:text-foreground"
          }
          aria-current={active === "invitations" ? "page" : undefined}
        >
          Pending invitations
        </ButtonLink>
      </nav>
      {canManage ? (
        <ButtonLink href="/app/admin/team/invite" variant="primary" size="md">
          Invite employee
        </ButtonLink>
      ) : null}
    </div>
  );
}
