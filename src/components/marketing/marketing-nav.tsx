"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { IconClose, IconMenu } from "@/components/marketing/marketing-icons";
import { buttonClassName } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#who-its-for", label: "Who it's for" },
] as const;

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="marketing-nav sticky top-0 z-40 border-b border-white/10 bg-[color-mix(in_srgb,var(--navy-950)_92%,transparent)] text-white backdrop-blur-md">
      <div className="marketing-container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="brand-mark text-white">
          <span className="brand-mark-mark" aria-hidden>
            M
          </span>
          MagicCRM
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium text-white/85 transition-colors hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a href="#product" className={buttonClassName({ variant: "ghost", className: "text-white hover:bg-white/10" })}>
            Explore the platform
          </a>
          <Link href="/sign-in" className={buttonClassName({ variant: "primary", className: "shadow-md" })}>
            Employee sign in
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:hidden"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          {open ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div id={panelId} className="border-t border-white/10 bg-[var(--navy-950)] px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile primary">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-[var(--radius-control)] px-3 py-3 text-base font-medium text-white hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#product"
              className="rounded-[var(--radius-control)] px-3 py-3 text-base font-medium text-white hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              Explore the platform
            </a>
            <Link
              href="/sign-in"
              className={buttonClassName({ variant: "primary", className: "mt-2 w-full" })}
              onClick={() => setOpen(false)}
            >
              Employee sign in
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
