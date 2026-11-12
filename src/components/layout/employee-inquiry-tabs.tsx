"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

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

function tabIndexOf(id: EmployeeInquiryTabId): number {
  return TABS.findIndex((tab) => tab.id === id);
}

/**
 * Progressive-disclosure tabs for the employee inquiry workspace.
 * Panels stay mounted (hidden) so unsaved quote edits are not lost on tab switch.
 * Horizontal keyboard navigation follows the WAI-ARIA Tabs pattern.
 */
export function EmployeeInquiryTabs({
  defaultTab = "overview",
  panels,
  badges,
}: EmployeeInquiryTabsProps) {
  const [active, setActive] = useState<EmployeeInquiryTabId>(defaultTab);
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activateAt = useCallback((index: number) => {
    const next = TABS[(index + TABS.length) % TABS.length];
    if (!next) return;
    setActive(next.id);
    queueMicrotask(() => {
      tabRefs.current[tabIndexOf(next.id)]?.focus();
    });
  }, []);

  const onTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          activateAt(index + 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          activateAt(index - 1);
          break;
        case "Home":
          event.preventDefault();
          activateAt(0);
          break;
        case "End":
          event.preventDefault();
          activateAt(TABS.length - 1);
          break;
        default:
          break;
      }
    },
    [activateAt],
  );

  return (
    <div className="mt-6" data-employee-inquiry-tabs>
      <div
        role="tablist"
        aria-label="Inquiry workspace sections"
        aria-orientation="horizontal"
        className="flex gap-1 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-muted/40 p-1"
      >
        {TABS.map((tab, index) => {
          const selected = active === tab.id;
          const badge = badges?.[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${baseId}-${tab.id}-tab`}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
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
              onKeyDown={(event) => onTabKeyDown(event, index)}
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
