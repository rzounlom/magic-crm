/**
 * Lightweight Server Action phase timing for R9 latency investigation.
 * Enable with MAGICCRM_MUTATION_TIMING=1 (dev/TEST only — no PII in labels).
 */

export type MutationTimingPhase =
  | "auth_context"
  | "domain_mutation"
  | "cache_invalidation"
  | "total";

export function mutationTimingEnabled(): boolean {
  return process.env.MAGICCRM_MUTATION_TIMING === "1";
}

export function startMutationTimer(action: string): {
  mark: (phase: MutationTimingPhase) => void;
  end: () => void;
} {
  if (!mutationTimingEnabled()) {
    return { mark: () => undefined, end: () => undefined };
  }
  const t0 = performance.now();
  let last = t0;
  const marks: Record<string, number> = {};
  return {
    mark(phase) {
      const now = performance.now();
      marks[phase] = Math.round(now - last);
      last = now;
    },
    end() {
      marks.total = Math.round(performance.now() - t0);
      console.info(
        JSON.stringify({
          scope: "magiccrm.mutation-timing",
          action,
          phasesMs: marks,
        }),
      );
    },
  };
}
