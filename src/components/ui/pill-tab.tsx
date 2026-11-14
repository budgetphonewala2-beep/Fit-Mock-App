import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One item in a horizontal tab-strip. The selected item fills teal;
 * the rest read as flat labels. Used for date strips, tab groups,
 * segmented pickers.
 */
type PillTabProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

export function PillTab({
  className,
  selected,
  type = "button",
  ...props
}: PillTabProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex flex-col items-center justify-center rounded-pill px-2.5 py-1.5 text-body-s font-semibold transition-colors duration-150",
        selected
          ? "bg-teal-900 text-sand-100 shadow-tile"
          : "bg-transparent text-ink-500 hover:text-ink-700",
        className,
      )}
      {...props}
    />
  );
}

/** Horizontal row of PillTabs with subtle spacing. */
export function PillTabs({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-1 overflow-x-auto", className)}
      {...props}
    />
  );
}
