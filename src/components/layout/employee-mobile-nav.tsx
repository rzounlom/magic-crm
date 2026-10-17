"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { ModuleNavLink } from "@/components/ui/module-nav-link";
import {
  EMPLOYEE_NAV_GROUP_LABELS,
  filterEmployeeNavItems,
  isEmployeeNavActive,
  mobileMoreNavItems,
  mobilePrimaryNavItems,
  type EmployeeNavItemId,
} from "@/lib/ui/employee-navigation";
import { cn } from "@/lib/ui/cn";

type EmployeeMobileNavProps = {
  visibleNavIds: EmployeeNavItemId[];
  publicInquiryHref: string | null;
};

export function EmployeeMobileNav({ visibleNavIds, publicInquiryHref }: EmployeeMobileNavProps) {
  const pathname = usePathname();
  const visible = new Set(visibleNavIds);
  const primary = mobilePrimaryNavItems(visible);
  const moreItems = mobileMoreNavItems(visible);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const dialogId = useId();
  const moreRouteActive = moreItems.some((item) => isEmployeeNavActive(pathname, item.href));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (moreOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      closeRef.current?.focus();
      return;
    }
    if (dialog.open) {
      dialog.close();
    }
    moreButtonRef.current?.focus();
  }, [moreOpen]);

  if (primary.length === 0 && moreItems.length === 0 && !publicInquiryHref) {
    return null;
  }

  const catalog = filterEmployeeNavItems(visible).filter((item) => item.group === "catalog");
  const settings = filterEmployeeNavItems(visible).filter((item) => item.group === "settings");
  const overview = filterEmployeeNavItems(visible).filter((item) => item.group === "overview");
  const closeMore = () => setMoreOpen(false);

  return (
    <>
      <nav
        className="employee-mobile-nav lg:hidden"
        aria-label="Primary"
        data-employee-mobile-nav
      >
        {primary.map((item) => (
          <ModuleNavLink
            key={item.id}
            href={item.href}
            variant="bottom"
            badge={item.badge}
            onNavigate={closeMore}
          >
            {item.label}
          </ModuleNavLink>
        ))}
        <button
          ref={moreButtonRef}
          type="button"
          className={cn("employee-bottom-nav-link", (moreOpen || moreRouteActive) && "is-active")}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-controls={dialogId}
          onClick={() => setMoreOpen(true)}
        >
          <MoreIcon />
          <span>More</span>
        </button>
      </nav>

      <dialog
        ref={dialogRef}
        id={dialogId}
        aria-labelledby={titleId}
        className="employee-more-dialog fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none translate-y-0 rounded-t-[var(--radius-dialog)] border border-border bg-surface p-0 text-foreground shadow-[var(--shadow-overlay)] backdrop:bg-foreground/40 open:flex open:flex-col"
        onCancel={(event) => {
          event.preventDefault();
          closeMore();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeMore();
          }
        }}
      >
        <div className="border-b border-border-subtle px-4 py-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-base font-semibold">
              More
            </h2>
            <button
              ref={closeRef}
              type="button"
              className="cursor-pointer rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              onClick={closeMore}
            >
              Close
            </button>
          </div>
        </div>
        <div className="max-h-[min(70vh,28rem)] overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {overview.length > 0 ? (
            <MoreSection title={EMPLOYEE_NAV_GROUP_LABELS.overview}>
              {overview.map((item) => (
                <ModuleNavLink
                  key={item.id}
                  href={item.href}
                  variant="menu"
                  badge={item.badge}
                  onNavigate={closeMore}
                >
                  {item.label}
                </ModuleNavLink>
              ))}
            </MoreSection>
          ) : null}
          {catalog.length > 0 ? (
            <MoreSection title={EMPLOYEE_NAV_GROUP_LABELS.catalog}>
              {catalog.map((item) => (
                <ModuleNavLink
                  key={item.id}
                  href={item.href}
                  variant="menu"
                  badge={item.badge}
                  onNavigate={closeMore}
                >
                  {item.label}
                </ModuleNavLink>
              ))}
            </MoreSection>
          ) : null}
          {settings.length > 0 ? (
            <MoreSection title={EMPLOYEE_NAV_GROUP_LABELS.settings}>
              {settings.map((item) => (
                <ModuleNavLink
                  key={item.id}
                  href={item.href}
                  variant="menu"
                  badge={item.badge}
                  onNavigate={closeMore}
                >
                  {item.label}
                </ModuleNavLink>
              ))}
            </MoreSection>
          ) : null}
          {publicInquiryHref ? (
            <MoreSection title="Public intake">
              <a
                href={publicInquiryHref}
                target="_blank"
                rel="noopener noreferrer"
                className="employee-more-nav-link"
                onClick={closeMore}
              >
                <ExternalIcon />
                <span>Public inquiry</span>
              </a>
            </MoreSection>
          ) : null}
          {moreItems.length === 0 && !publicInquiryHref ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">No additional destinations.</p>
          ) : null}
        </div>
      </dialog>
    </>
  );
}

function MoreSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 last:mb-0" aria-label={title}>
      <h3 className="px-2 pb-1 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0" fill="currentColor">
      <circle cx="3" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="13" cy="8" r="1.25" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6.5 3.5H3.5v9h9v-3M8.5 3.5H12.5V7.5M7 9l5.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
