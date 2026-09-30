import { LoadingIndicator } from "@/components/ui/loading-indicator";

type BlockingMutationProps = {
  active: boolean;
  label: string;
};

/**
 * Page-critical mutation cover. Local button spinners stay the right treatment
 * for small updates such as marking a notification read.
 */
export function BlockingMutation({ active, label }: BlockingMutationProps) {
  if (!active) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="rounded-2xl border border-border bg-surface px-6 py-5 text-foreground shadow-xl">
        <LoadingIndicator label={label} />
      </div>
    </div>
  );
}
