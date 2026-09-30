"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function ModuleNavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={active ? "module-nav is-active" : "module-nav"}>
      <NavIcon href={href} />
      <span className="lg:max-xl:sr-only">{children}</span>
    </Link>
  );
}

function NavIcon({ href }: { href: string }) {
  const path = iconPath(href);
  if (!path) {
    return null;
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function iconPath(href: string) {
  if (href.startsWith("/app/inquiries")) {
    return "M2.5 3.5h11v9h-11zM2.5 6.5h11";
  }
  if (href.startsWith("/app/bookings")) {
    return "M3 2.5h10v11H3zM6 2.5v2M10 2.5v2M3 6.5h10";
  }
  if (href.startsWith("/app/schedule")) {
    return "M2.5 4.5h11v8h-11zM5 3v3M11 3v3M2.5 7.5h11";
  }
  if (href.startsWith("/app/admin/resources")) {
    return "M3 8.5 8 3.5l5 5M5 8.5V13h6V8.5";
  }
  if (href.startsWith("/app/admin/team")) {
    return "M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM2.5 13c.4-2 1.6-3 3-3s2.6 1 3 3M10.5 6.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM10 10c1.2 0 2.2.7 2.7 2";
  }
  if (href.startsWith("/app/admin/security-groups")) {
    return "M8 2.5 3.5 4.5v3.2c0 2.6 1.8 4.4 4.5 5.3 2.7-.9 4.5-2.7 4.5-5.3V4.5z";
  }
  if (href.startsWith("/app/admin/ai")) {
    return "M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2M4.2 4.2l1.4 1.4M10.4 10.4l1.4 1.4M11.8 4.2l-1.4 1.4M5.6 10.4 4.2 11.8";
  }
  return "";
}
