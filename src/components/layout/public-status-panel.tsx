import { Card, CardDescription } from "@/components/ui/card";
import { PLANNER_FRAME_CLASS } from "@/components/layout/public-content";

type PublicStatusPanelProps = {
  eyebrow?: string;
  title: string;
  description: string;
  hint?: string;
};

/**
 * Calm public-facing status for missing org, empty proposals, and similar blockers.
 * Never include internal IDs or stack traces.
 */
export function PublicStatusPanel({
  eyebrow = "MagicCRM",
  title,
  description,
  hint,
}: PublicStatusPanelProps) {
  return (
    <section className="flex flex-1 flex-col py-8 sm:py-12">
      <div className={PLANNER_FRAME_CLASS}>
        <Card
          variant="default"
          padding="lg"
          className="mx-auto w-full max-w-lg"
          data-public-status
        >
          <p className="page-eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-[length:var(--text-title)] font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          <CardDescription className="mt-2 text-[length:var(--text-body)]">{description}</CardDescription>
          {hint ? <p className="mt-4 text-sm text-muted-foreground">{hint}</p> : null}
        </Card>
      </div>
    </section>
  );
}
