"use client";

export function LoadingIndicator({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="magiccrm-spinner inline-block size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent"
        aria-hidden
      />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}
