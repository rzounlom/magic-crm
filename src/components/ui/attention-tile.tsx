import Link from "next/link";

import { cn } from "@/lib/ui/cn";

type AttentionTileProps = {
  count: number;
  title: string;
  detail: string;
  href: string;
  className?: string;
};

export function AttentionTile({ count, title, detail, href, className }: AttentionTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "attention-tile group flex items-center gap-3 border-t border-border-subtle py-3 first:border-t-0",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        className,
      )}
    >
      <span className="attention-tile-count w-10 shrink-0 text-[length:var(--text-title)] font-bold tabular-nums text-primary">
        {count}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground group-hover:text-primary">{title}</span>
        <span className="mt-0.5 block text-[length:var(--text-caption)] text-muted-foreground">{detail}</span>
      </span>
      <span className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden>
        →
      </span>
    </Link>
  );
}
