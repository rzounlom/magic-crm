"use client";

import { notify } from "@/lib/ui/notify";

export function CopyValueButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      className="text-sm text-primary"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        notify.success({ title: `${label} copied` });
      }}
    >
      Copy {label.toLowerCase()}
    </button>
  );
}
