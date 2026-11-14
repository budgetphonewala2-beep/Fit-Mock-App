import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Compact stat card used in row groups (Today's Daily Wins, Protein, Plan Day).
 * A label sits on top, a big value below, and an optional progress bar
 * or hint underneath.
 */
type StatTileProps = React.HTMLAttributes<HTMLDivElement> & {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  /** 0–1 progress bar underneath the value. Omit to hide. */
  progress?: number;
  tone?: "default" | "accent" | "brand";
};

export function StatTile({
  label,
  value,
  hint,
  icon,
  progress,
  tone = "default",
  className,
  ...props
}: StatTileProps) {
  const barColor =
    tone === "accent"
      ? "bg-accent"
      : tone === "brand"
        ? "bg-brand"
        : "bg-primary";
  return (
    <div
      className={cn(
        "rounded-tile border border-border bg-white p-3.5 shadow-tile",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5 text-overline uppercase tracking-[0.16em] text-ink-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1.5 text-title-m font-semibold text-ink-900">
        {value}
      </div>
      {typeof progress === "number" ? (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-pill bg-sand-200">
          <div
            className={cn("h-full rounded-pill transition-[width]", barColor)}
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      ) : null}
      {hint ? (
        <div className="mt-1.5 text-body-s text-ink-500">{hint}</div>
      ) : null}
    </div>
  );
}
