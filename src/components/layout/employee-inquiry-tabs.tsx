"use client";

import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type EmployeeInquiryTabId = "overview" | "quote" | "recommendations" | "activity";

const TABS: Array<{ id: EmployeeInquiryTabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "quote", label: "Staff quote" },
  { id: "recommendations", label: "Recommendations" },
  { id: "activity", label: "Activity & notes" },
];

type EmployeeInquiryTabsProps = {
  defaultTab?: EmployeeInquiryTabId;
  panels: Record<EmployeeInquiryTabId, ReactNode>;
  /** Optional badges shown next to tab labels (e.g. warning counts). */
  badges?: Partial<Record<EmployeeInquiryTabId, string>>;
};

/**
 * Progressive-disclosure tabs for the employee inquiry workspace.
 * Panels stay mounted (hidden) so unsaved quote edits are not lost on tab switch.
 */
export function EmployeeInquiryTabs({
  defaultTab = "overview",
  panels,
  badges,
}: EmployeeInquiryTabsProps) {
  const [active, setActive] = useState<EmployeeInquiryTabId>(defaultTab);
  const baseId = useId();

  return (
    <div className="mt-6" data-employee-inquiry-tabs>
      <div
        role="tablist"
        aria-label="Inquiry workspace sections"
        className="flex gap-1 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-muted/40 p-1"
      >
        {TABS.map((tab) => {
          const selected = active === tab.id;
          const badge = badges?.[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${baseId}-${tab.id}-tab`}
              aria-selected={selected}
              aria-controls={`${baseId}-${tab.id}-panel`}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm font-semibold transition",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                selected
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
              {badge ? (
                <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[length:var(--text-caption)] font-semibold text-warning">
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {TABS.map((tab) => {
        const selected = active === tab.id;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${baseId}-${tab.id}-panel`}
            aria-labelledby={`${baseId}-${tab.id}-tab`}
            hidden={!selected}
            className="mt-5"
          >
            {panels[tab.id]}
          </div>
        );
      })}
    </div>
  );
}
