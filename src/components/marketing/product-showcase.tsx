"use client";

import Image from "next/image";
import { useId, useState } from "react";

import { cn } from "@/lib/ui/cn";

type ShowcaseItem = {
  id: string;
  label: string;
  title: string;
  description: string;
  image?: { src: string; alt: string; width: number; height: number };
  pendingNote?: string;
};

const ITEMS: ShowcaseItem[] = [
  {
    id: "intake",
    label: "Customer intake",
    title: "A guided event planner guests actually finish",
    description:
      "Event type, group size, activities, and timing preferences flow into one clear journey — with Back, Continue, and privacy-conscious draft restore.",
    image: {
      src: "/marketing/intake-desktop-event.png",
      alt: "MagicCRM customer intake showing event-type selection cards and progress steps",
      width: 1280,
      height: 800,
    },
  },
  {
    id: "preferences",
    label: "Preferences",
    title: "Capture the fun without inventing availability",
    description:
      "Activities, food, space, budget, and length guide recommendations. Selecting an activity never claims capacity or collects payment.",
    image: {
      src: "/marketing/intake-desktop-fun.png",
      alt: "MagicCRM intake preferences step with activity and food options",
      width: 1280,
      height: 800,
    },
  },
  {
    id: "timing",
    label: "Timing",
    title: "Venue-local date and time preferences",
    description:
      "Preferred start times are interpreted in the venue’s wall clock — including late evening options — without presenting them as confirmed reservations.",
    image: {
      src: "/marketing/intake-desktop-when.png",
      alt: "MagicCRM intake when step with event date and preferred start time",
      width: 1280,
      height: 800,
    },
  },
  {
    id: "mobile",
    label: "Mobile",
    title: "Designed for phones, not shrunk from desktop",
    description:
      "Touch-friendly cards, compact progress, and a clear primary action keep the guest experience usable from 320px up.",
    image: {
      src: "/marketing/intake-mobile-event.png",
      alt: "MagicCRM customer intake on a phone-sized viewport",
      width: 390,
      height: 780,
    },
  },
  {
    id: "staff",
    label: "Staff workspace",
    title: "Inquiries, Booking Coach, and schedule",
    description:
      "Staff use MagicCRM to review inquiries, prepare personalized options, place optional HOLDs, and confirm bookings through authorized workflows.",
    pendingNote:
      "Authentic staff screenshots require a dedicated Clerk TEST session (PLAYWRIGHT_STORAGE_STATE). They are not invented here.",
  },
];

export function ProductShowcase() {
  const [active, setActive] = useState(ITEMS[0]!.id);
  const tablistId = useId();
  const current = ITEMS.find((item) => item.id === active) ?? ITEMS[0]!;

  return (
    <div className="marketing-showcase">
      <div
        role="tablist"
        aria-label="Product showcase"
        id={tablistId}
        className="flex flex-wrap gap-2"
      >
        {ITEMS.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${tablistId}-${item.id}`}
              aria-selected={selected}
              aria-controls={`${tablistId}-panel`}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "min-h-11 cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                selected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-foreground hover:bg-[color-mix(in_srgb,var(--primary)_12%,var(--muted))]",
              )}
              onClick={() => setActive(item.id)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                  return;
                }
                event.preventDefault();
                const index = ITEMS.findIndex((row) => row.id === active);
                const next =
                  event.key === "ArrowRight"
                    ? ITEMS[(index + 1) % ITEMS.length]!
                    : ITEMS[(index - 1 + ITEMS.length) % ITEMS.length]!;
                setActive(next.id);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${tablistId}-panel`}
        aria-labelledby={`${tablistId}-${current.id}`}
        className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center"
      >
        <div>
          <h3 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{current.title}</h3>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{current.description}</p>
          {current.pendingNote ? (
            <p className="mt-4 rounded-[var(--radius-control)] border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              {current.pendingNote}
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Illustrative capture from a MagicCRM test environment. Host branding is hidden for marketing.
            </p>
          )}
        </div>

        <div className="marketing-frame relative min-h-[18rem] overflow-hidden rounded-[1.25rem] border border-border bg-[var(--navy-950)] p-3 shadow-[var(--shadow-overlay)] sm:min-h-[22rem] sm:p-4">
          {current.image ? (
            <div
              className={cn(
                "relative h-full w-full overflow-hidden rounded-[0.9rem] bg-[var(--canvas-50)]",
                current.id === "mobile" ? "mx-auto max-w-[20rem]" : "min-h-[16rem] sm:min-h-[20rem]",
              )}
            >
              <Image
                src={current.image.src}
                alt={current.image.alt}
                width={current.image.width}
                height={current.image.height}
                className={cn(
                  "h-auto w-full object-cover object-top",
                  current.id === "mobile" ? "mx-auto" : "min-h-[16rem] sm:min-h-[20rem]",
                )}
                sizes={current.id === "mobile" ? "320px" : "(max-width: 1024px) 100vw, 560px"}
              />
            </div>
          ) : (
            <div className="flex min-h-[16rem] flex-col justify-between rounded-[0.9rem] bg-[linear-gradient(160deg,#001c64_0%,#003087_55%,#0070e0_120%)] p-6 text-white sm:min-h-[20rem]">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] uppercase text-white/70">Staff workspace</p>
                <p className="mt-3 text-xl font-semibold">Inquiries · Booking Coach · Schedule</p>
                <p className="mt-2 max-w-sm text-sm text-white/80">
                  Real staff UI screenshots will appear here once a dedicated TEST Clerk storage state is available.
                </p>
              </div>
              <ul className="space-y-2 text-sm text-white/85">
                <li>Inquiry inbox for event leads</li>
                <li>Booking Coach with HOLD vs confirmation readiness</li>
                <li>Resource-aware schedule views</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
