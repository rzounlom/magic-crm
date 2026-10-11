import Image from "next/image";
import Link from "next/link";

import {
  IconCorporate,
  IconGroup,
  IconHold,
  IconInquiry,
  IconParty,
  IconPreferences,
  IconProposal,
  IconSchedule,
  IconShield,
  IconSpark,
  IconVenue,
} from "@/components/marketing/marketing-icons";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { ProductShowcase } from "@/components/marketing/product-showcase";
import { buttonClassName } from "@/components/ui/button";

const WORKFLOW = [
  {
    step: "1",
    title: "Capture an event inquiry",
    detail: "Guests share event type, group size, activities, and timing preferences through a guided planner.",
    icon: IconInquiry,
  },
  {
    step: "2",
    title: "Understand preferences",
    detail: "Food, space, budget, and length help the workspace recommend options — without inventing availability.",
    icon: IconPreferences,
  },
  {
    step: "3",
    title: "Prepare personalized options",
    detail: "Staff and AI-assisted sales support assemble event options grounded in the venue’s catalog.",
    icon: IconProposal,
  },
  {
    step: "4",
    title: "Coordinate resources & optional HOLDs",
    detail: "Optional HOLDs reserve attention on inventory for a limited window. A HOLD is not a confirmed booking.",
    icon: IconHold,
  },
  {
    step: "5",
    title: "Confirm through authorized staff",
    detail: "Booking confirmation stays in staff workflows with permissions, readiness checks, and clear next steps.",
    icon: IconShield,
  },
] as const;

const FEATURES = [
  {
    title: "Customer inquiry intake",
    detail: "A modern, mobile-friendly planner that captures what groups need before anyone builds options.",
    icon: IconInquiry,
  },
  {
    title: "Event planning & proposals",
    detail: "Turn preferences into personalized event options your team can refine and share.",
    icon: IconProposal,
  },
  {
    title: "Staff booking workflow",
    detail: "Booking Coach keeps HOLD readiness and confirmation readiness distinct and actionable.",
    icon: IconHold,
  },
  {
    title: "Resource-aware scheduling",
    detail: "Scheduling asks the same availability engines the rest of the platform uses — no parallel occupancy math.",
    icon: IconSchedule,
  },
  {
    title: "AI-assisted event sales support",
    detail: "Structured recommendations help staff move faster while staying grounded in tenant configuration.",
    icon: IconSpark,
  },
  {
    title: "Organization access & permissions",
    detail: "Security groups and permissions keep sensitive booking actions behind authorized roles.",
    icon: IconShield,
  },
] as const;

const AUDIENCES = [
  { title: "Family entertainment centers", detail: "Birthday parties, groups, and high-energy attractions.", icon: IconVenue },
  { title: "Bowling & attractions", detail: "Lanes, bays, and multi-activity packages with real inventory constraints.", icon: IconParty },
  { title: "Corporate & team outings", detail: "Clear options for appreciation events and offsites.", icon: IconCorporate },
  { title: "School & community groups", detail: "Supervised visits and flexible packages for larger parties.", icon: IconGroup },
] as const;

export function MarketingHome() {
  return (
    <div className="marketing-page min-h-full bg-background text-foreground" data-marketing-home>
      <MarketingNav />
      <main>
        <Hero />
        <ProductSection />
        <WorkflowSection />
        <FeaturesSection />
        <AudienceSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="marketing-hero relative overflow-hidden text-white">
      <div className="marketing-hero-glow" aria-hidden />
      <div className="marketing-container relative grid gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:py-24">
        <div className="marketing-reveal">
          <p className="text-xs font-bold tracking-[0.18em] text-[color-mix(in_srgb,#9ec5ff_90%,white)] uppercase">
            For entertainment venues &amp; experience-driven businesses
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-[3.35rem] lg:leading-[1.08]">
            Turn every inquiry into something extraordinary.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/85">
            Bring event inquiries, personalized proposals, booking workflows, and resource-aware scheduling into one
            beautifully connected workspace.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a href="#product" className={buttonClassName({ variant: "primary", size: "lg", className: "shadow-lg" })}>
              Explore the platform
            </a>
            <Link
              href="/sign-in"
              className={buttonClassName({
                variant: "secondary",
                size: "lg",
                className: "border-white/30 bg-white/10 text-white hover:bg-white/15",
              })}
            >
              Employee sign in
            </Link>
          </div>
          <p className="mt-6 max-w-md text-sm text-white/70">
            Submitting an inquiry does not reserve activities or collect payment. Confirmation stays with authorized
            staff.
          </p>
        </div>

        <div className="marketing-hero-visual relative marketing-reveal">
          <div className="marketing-frame relative overflow-hidden rounded-[1.35rem] border border-white/15 bg-white/5 p-2 shadow-[0_24px_80px_rgb(0_0_0/0.35)] sm:p-3">
            <Image
              src="/marketing/intake-desktop-event.png"
              alt="MagicCRM customer event intake with event-type selection"
              width={1280}
              height={800}
              priority
              className="h-auto w-full rounded-[1rem] object-cover object-top"
              sizes="(max-width: 1024px) 100vw, 640px"
            />
          </div>
          <div className="marketing-phone-frame absolute -right-2 -bottom-6 hidden w-[38%] overflow-hidden rounded-[1.4rem] border border-white/20 bg-[var(--navy-950)] p-1.5 shadow-[0_20px_50px_rgb(0_0_0/0.45)] sm:block lg:-right-4 lg:bottom-4">
            <Image
              src="/marketing/intake-mobile-event.png"
              alt="MagicCRM intake on a mobile viewport"
              width={390}
              height={780}
              className="h-auto w-full rounded-[1.1rem] object-cover object-top"
              sizes="220px"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductSection() {
  return (
    <section id="product" className="marketing-section scroll-mt-24 bg-background py-20 sm:py-24">
      <div className="marketing-container">
        <div className="max-w-2xl">
          <p className="page-eyebrow">Product</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Real MagicCRM, not a fictional dashboard
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Explore authentic captures of the customer planner. Staff workspace photography is waiting on a dedicated
            TEST Clerk session — we will not invent screenshots.
          </p>
        </div>
        <div className="mt-10">
          <ProductShowcase />
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section id="how-it-works" className="marketing-section scroll-mt-24 border-y border-border bg-surface py-20 sm:py-24">
      <div className="marketing-container">
        <div className="max-w-2xl">
          <p className="page-eyebrow">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">From first question to confirmed booking</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A proposal or HOLD is never automatically a confirmed booking. Payment collection is not part of this
            experience.
          </p>
        </div>
        <ol className="mt-12 grid gap-4 lg:grid-cols-5">
          {WORKFLOW.map((item) => (
            <li
              key={item.step}
              className="relative rounded-[var(--radius-card)] border border-border bg-background p-5 shadow-[var(--shadow-card)]"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {item.step}
              </span>
              <item.icon className="mt-4 h-5 w-5 text-primary" />
              <h3 className="mt-3 text-base font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="marketing-section bg-background py-20 sm:py-24">
      <div className="marketing-container">
        <div className="max-w-2xl">
          <p className="page-eyebrow">Capabilities</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Built for the work venues actually do</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Honest about what ships today. MagicCRM does not claim point-of-sale systems, payment processing, automated
            tax, or advanced analytics as live product features.
          </p>
        </div>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-card)]"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AudienceSection() {
  return (
    <section id="who-its-for" className="marketing-section scroll-mt-24 bg-[linear-gradient(180deg,var(--canvas-50),#eaf1fb)] py-20 sm:py-24">
      <div className="marketing-container">
        <div className="max-w-2xl">
          <p className="page-eyebrow">Who it&apos;s for</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Experience-driven venues</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Family entertainment centers, bowling and attractions, birthday and group events, corporate outings, and
            school or community visits — configured per organization, never hardcoded to a single tenant.
          </p>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((item) => (
            <li key={item.title} className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
              <item.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="marketing-section py-20 sm:py-24">
      <div className="marketing-container">
        <div className="overflow-hidden rounded-[1.5rem] bg-[linear-gradient(135deg,var(--navy-950),var(--brand-900)_55%,var(--action-600))] px-6 py-12 text-white shadow-[var(--shadow-overlay)] sm:px-12 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to see the workspace in motion?</h2>
            <p className="mt-4 text-lg text-white/85">
              Explore the product story above, or sign in if you already have an organization on MagicCRM.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#product"
                className={buttonClassName({
                  variant: "secondary",
                  size: "lg",
                  className: "border-transparent bg-white text-[var(--navy-950)] hover:bg-white/90",
                })}
              >
                Explore the platform
              </a>
              <Link
                href="/sign-in"
                className={buttonClassName({
                  variant: "ghost",
                  size: "lg",
                  className: "text-white hover:bg-white/10",
                })}
              >
                Employee sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-surface py-10">
      <div className="marketing-container flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="brand-mark">
            <span className="brand-mark-mark" aria-hidden>
              M
            </span>
            MagicCRM
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Effortless Precision for experience-driven venues.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium" aria-label="Footer">
          <a href="#product" className="text-foreground hover:text-primary">
            Product
          </a>
          <a href="#how-it-works" className="text-foreground hover:text-primary">
            How it works
          </a>
          <a href="#who-its-for" className="text-foreground hover:text-primary">
            Who it&apos;s for
          </a>
          <Link href="/sign-in" className="text-foreground hover:text-primary">
            Employee sign in
          </Link>
        </nav>
      </div>
      <div className="marketing-container mt-8 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>Privacy and terms pages are a prelaunch requirement — links are not invented here.</p>
      </div>
    </footer>
  );
}
