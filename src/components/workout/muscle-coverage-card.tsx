"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, ScanLine } from "lucide-react";
import { IconBadge } from "@/components/glass/icon-badge";
import {
  getMuscleCoverageSummary,
  type MuscleCoverageEntry,
} from "@/lib/muscle-coverage";
import { cn } from "@/lib/utils";

export function MuscleCoverageCard({
  entries,
  score,
  onAddFinisher,
  layout = "pill",
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  entries: MuscleCoverageEntry[];
  score: number;
  onAddFinisher: (entry: MuscleCoverageEntry) => void;
  /**
   * "tile" renders as a cell of a two-column glass grid: the trigger fills one
   * cell and the drawer spans the full row beneath it. "compact-tile" is the
   * small centred cell for the Home session bar's four-up stats row.
   */
  layout?: "pill" | "tile" | "mini-tile";
  /**
   * When provided, the parent owns the expanded state so it survives remounts
   * (e.g. the Home session bar collapsing the stats row on scroll-pin).
   */
  expanded?: boolean;
  onExpandedChange?: (next: boolean) => void;
}) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false);
  const expanded = controlledExpanded ?? uncontrolledExpanded;
  const setExpanded = (updater: boolean | ((current: boolean) => boolean)) => {
    const next = typeof updater === "function" ? updater(expanded) : updater;
    if (onExpandedChange) {
      onExpandedChange(next);
    } else {
      setUncontrolledExpanded(next);
    }
  };
  // The list is sorted worst-first, so the group that most needs attention is
  // the one already selected when the drawer opens.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null;

  const pillTrigger = (
    <button
      type="button"
      onClick={() => setExpanded((current) => !current)}
      aria-expanded={expanded}
      className={cn(
        "flex w-full items-center gap-3 rounded-full border bg-white/86 px-4 py-2.5 text-left shadow-[0_10px_22px_rgba(57,81,33,0.06)] transition active:scale-[0.99]",
        expanded ? "border-foreground" : "border-white/62 hover:border-primary/30",
      )}
    >
      <span className="shrink-0 text-[12px] font-semibold tracking-[-0.02em] text-foreground">
        Muscle coverage
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-[3px]">
        {entries.map((entry) => (
          <span
            key={entry.id}
            className={cn(
              "h-2 min-w-0 flex-1 rounded-full",
              entry.state === "fresh"
                ? "bg-forest"
                : entry.state === "due"
                  ? "bg-forest/26"
                  : "bg-accent/78",
            )}
          />
        ))}
      </span>
      <span className="shrink-0 text-[12px] font-semibold tabular-nums text-foreground">
        {score}/{entries.length}
      </span>
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-foreground/45 transition-transform duration-200",
          expanded && "rotate-180",
        )}
      />
    </button>
  );

  const tileTrigger = (
    <button
      type="button"
      onClick={() => setExpanded((current) => !current)}
      aria-expanded={expanded}
      className={cn(
        "flex h-[118px] w-full flex-col rounded-[22px] px-3 py-3 text-left transition active:scale-[0.98]",
        expanded ? "glass-tint border-foreground/60" : "glass",
      )}
    >
      <span className="flex items-center gap-2">
        <IconBadge tone={expanded ? "dark" : "light"}>
          <ScanLine className="h-4 w-4" />
        </IconBadge>
        <span className="text-[12px] leading-tight">Muscle coverage</span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </span>
      <span className="mt-auto flex items-end justify-between gap-2">
        <span>
          <span className="text-[32px] font-light leading-none tracking-[-0.04em]">{score}</span>
          <span className="text-[12px] opacity-60">/{entries.length}</span>
        </span>
        {/* One dot per muscle group, coloured by the same states as the pill. */}
        <span className="mb-1 grid shrink-0 grid-cols-6 gap-[3px]" aria-hidden="true">
          {entries.map((entry) => (
            <span
              key={entry.id}
              className={cn(
                "h-[6px] w-[6px] rounded-full",
                entry.state === "fresh"
                  ? "bg-forest"
                  : entry.state === "due"
                    ? "bg-forest/26"
                    : "bg-accent/78",
              )}
            />
          ))}
        </span>
      </span>
    </button>
  );

  const miniTileTrigger = (
    <button
      type="button"
      onClick={() => setExpanded((current) => !current)}
      aria-expanded={expanded}
      className={cn(
        "flex w-full flex-col items-center justify-center rounded-[14px] px-1 py-1.5 text-center transition active:scale-[0.98]",
        expanded ? "glass-tint border-foreground/60" : "glass-inset",
      )}
    >
      <span className="flex w-full min-w-0 items-center justify-center gap-1 text-[10px]">
        <ScanLine className="h-3 w-3 shrink-0 opacity-70" />
        <span className="truncate opacity-60">Coverage</span>
      </span>
      <span className="block text-[15px] leading-tight">
        {score}
        <span className="text-[10px] opacity-60">/{entries.length}</span>
      </span>
    </button>
  );

  const drawer = expanded ? (
      <div className="glass mt-2 rounded-card p-3">
        {selected ? (
          <div className="mb-3 border-b border-foreground/8 pb-3">
            <p className="text-[15px] font-semibold tracking-[-0.03em] text-foreground">
              {selected.label}
            </p>
            <p className="mt-0.5 text-[12px] leading-[1.35] text-foreground/50">
              {getMuscleCoverageSummary(selected)}
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          {entries.map((entry) => {
            const isSelected = selected?.id === entry.id;

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedId(entry.id)}
                className={cn(
                  "rounded-chip border px-2.5 py-2 text-left transition active:scale-[0.98]",
                  isSelected
                    ? "border-foreground bg-white"
                    : entry.state === "neglected"
                      ? "border-dashed border-accent/45 bg-accent/4"
                      : entry.state === "fresh"
                        ? "border-transparent bg-forest/10"
                        : "border-transparent bg-foreground/5",
                )}
              >
                <p className="truncate text-[13px] font-semibold tracking-[-0.02em] text-foreground">
                  {entry.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[11px] font-semibold",
                    entry.state === "neglected" ? "text-accent" : "text-foreground/45",
                  )}
                >
                  {/* Trained today: a check reads at a glance and dodges
                      the "0d" oddity. Once a group is neglected the state
                      chip already says so -- collapse the numeric label to
                      the same em-dash used for never-trained groups so the
                      neglected tiles read as one category. */}
                  {entry.state === "neglected" ? (
                    "—"
                  ) : entry.daysSince === 0 ? (
                    <Check className="inline-block h-3.5 w-3.5" aria-label="Trained today" />
                  ) : (
                    `${entry.daysSince}d`
                  )}
                </p>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-foreground/8">
                  <span
                    className={cn(
                      "block h-full rounded-full transition-[width] duration-500",
                      entry.state === "neglected" ? "bg-accent/80" : "bg-forest",
                    )}
                    style={{ width: `${Math.round(entry.freshness * 100)}%` }}
                  />
                </span>
              </button>
            );
          })}
        </div>

        {/* Home sessions pick finishers through the day's plan, not from
            here, so the quick-add shortcut only shows up for gym. */}
        {selected && layout !== "mini-tile" ? (
          <div className="mt-3 flex justify-end border-t border-foreground/8 pt-3">
            <button
              type="button"
              onClick={() => onAddFinisher(selected)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary-strong px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_12px_24px_rgba(12,39,35,0.2)] transition active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" />
              Add finisher
            </button>
          </div>
        ) : null}
      </div>
  ) : null;

  if (layout === "tile" || layout === "mini-tile") {
    return (
      <>
        {layout === "tile" ? tileTrigger : miniTileTrigger}
        {drawer ? (
          <div className={layout === "tile" ? "col-span-2" : "col-span-4"}>{drawer}</div>
        ) : null}
      </>
    );
  }

  return (
    <div className="mt-3">
      {pillTrigger}
      {drawer}
    </div>
  );
}
