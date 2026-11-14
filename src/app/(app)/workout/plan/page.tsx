"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  parseISO,
  startOfMonth,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Dumbbell, ListChecks } from "lucide-react";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { getCycleGoalHeadline, getCycleTargetWeightKg, getGoalCycle } from "@/lib/goal-cycle";
import { getGoalSummary, getSessionForDate } from "@/lib/recommendations";
import { cn, startOfTodayIso } from "@/lib/utils";

type DayState = "done" | "rest" | "missed" | "future" | "pre";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function formatLoad(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export default function WorkoutPlanPage() {
  const { state, hydrated } = useDietFit();
  const todayIso = startOfTodayIso();
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(parseISO(todayIso)));
  const [selectedIso, setSelectedIso] = useState(todayIso);

  const profile = state.profile;
  const workoutPlan = state.workoutPlan;

  const cycle = useMemo(
    () => (profile ? getGoalCycle(profile, todayIso) : null),
    [profile, todayIso],
  );

  const workoutDateSet = useMemo(
    () => new Set(state.workoutLogs.map((log) => log.sessionDate)),
    [state.workoutLogs],
  );

  if (!hydrated) return null;
  if (!profile || !workoutPlan || !cycle) {
    return (
      <div className="px-4 pt-6 text-sm text-foreground/50">
        Finish onboarding to see your plan activity.
      </div>
    );
  }

  const inCycle = (iso: string) => iso >= cycle.startedOn && iso <= cycle.endsOn;

  const stateFor = (iso: string): DayState => {
    if (iso > todayIso) return "future";
    if (workoutDateSet.has(iso)) return "done";
    if (iso < cycle.startedOn) return "pre";
    const session = getSessionForDate(workoutPlan, iso);
    if (session?.isRestDay) return "rest";
    return "missed";
  };

  // ── Summary across the plan window ──
  const workoutsDone = state.workoutLogs.filter((log) => inCycle(log.sessionDate)).length;
  const setsLogged = state.workoutLoadLogs.filter((log) => inCycle(log.sessionDate)).length;

  // ── Calendar grid for the viewed month ──
  const monthStart = startOfMonth(viewMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(viewMonth) });
  const leadingBlanks = getDay(monthStart); // 0 = Sunday
  const canPrev = format(monthStart, "yyyy-MM") > format(parseISO(cycle.startedOn), "yyyy-MM");
  const canNext = format(monthStart, "yyyy-MM") < format(parseISO(todayIso), "yyyy-MM");

  // ── Selected-day detail ──
  const selectedState = stateFor(selectedIso);
  const selectedLoads = state.workoutLoadLogs
    .filter((log) => log.sessionDate === selectedIso)
    .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName) || a.setNumber - b.setNumber);
  const selectedLog = state.workoutLogs.find((log) => log.sessionDate === selectedIso);

  const byExercise = new Map<string, { name: string; sets: typeof selectedLoads }>();
  for (const load of selectedLoads) {
    const entry = byExercise.get(load.exerciseId) ?? { name: load.exerciseName, sets: [] };
    entry.sets.push(load);
    byExercise.set(load.exerciseId, entry);
  }
  const exerciseGroups = Array.from(byExercise.values());

  // The program's promise leads the page; weight goals also show where the
  // number is headed.
  const goalHeadline =
    getCycleGoalHeadline(profile, cycle.totalDays) ?? getGoalSummary(profile).headline;
  const targetWeightKg = getCycleTargetWeightKg(profile);
  const goalSubline =
    targetWeightKg !== null && targetWeightKg !== profile.weightKg
      ? `${profile.weightKg} kg to ${targetWeightKg} kg · Till ${format(parseISO(cycle.endsOn), "d MMM")}`
      : `Till ${format(parseISO(cycle.endsOn), "d MMM yyyy")}`;

  const backHref = { pathname: "/workout", query: { environment: profile.workoutEnvironment } };

  const cellClass: Record<DayState, string> = {
    done: "bg-primary text-white font-bold shadow-[0_4px_10px_rgba(21,133,122,0.3)]",
    rest: "bg-foreground/[0.05] text-foreground/40",
    missed: "text-foreground/45 ring-1 ring-inset ring-accent/35",
    future: "text-foreground/25",
    pre: "text-foreground/20",
  };

  return (
    <div className="min-h-screen bg-transparent px-4 pb-10 pt-[calc(0.75rem+var(--safe-top))]">
      <section className="mx-auto w-full max-w-[460px]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Link
            href={backHref}
            className="flex items-center gap-1 text-[14px] font-semibold text-primary-strong transition active:scale-[0.97]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="rounded-full bg-primary-strong/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-strong">
            Plan
          </div>
        </div>

        {/* Title + progress */}
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Your program</p>
          <h1 className="mt-1.5 text-[30px] font-bold leading-[0.98] tracking-[-0.05em] text-foreground">
            {goalHeadline}
          </h1>
          <p className="mt-2 text-[13px] font-medium text-foreground/55">{goalSubline}</p>
          <div className="mt-4 flex items-center justify-between text-[13px] font-semibold text-foreground">
            <span>
              {cycle.isComplete ? "Plan complete" : `Day ${cycle.dayNumber} of ${cycle.totalDays}`}
            </span>
            <span className="text-foreground/45">{Math.round(cycle.progress)}%</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-foreground/8">
            <div
              className="h-full rounded-full bg-primary-strong transition-[width] duration-500"
              style={{ width: `${Math.round(cycle.progress)}%` }}
            />
          </div>
        </div>

        {/* Summary stats */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-chip border border-foreground/7 bg-white px-3 py-3 shadow-card">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-foreground/40">
              <Dumbbell className="h-3 w-3" />
              Workouts
            </div>
            <p className="mt-1.5 text-[22px] font-bold tracking-[-0.03em] text-foreground">{workoutsDone}</p>
          </div>
          <div className="rounded-chip border border-foreground/7 bg-white px-3 py-3 shadow-card">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-foreground/40">
              <ListChecks className="h-3 w-3" />
              Sets
            </div>
            <p className="mt-1.5 text-[22px] font-bold tracking-[-0.03em] text-foreground">{setsLogged}</p>
          </div>
          <div className="rounded-chip border border-foreground/7 bg-white px-3 py-3 shadow-card">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-foreground/40">
              <CalendarDays className="h-3 w-3" />
              Days left
            </div>
            <p className="mt-1.5 text-[22px] font-bold tracking-[-0.03em] text-foreground">{cycle.daysLeft}</p>
          </div>
        </div>

        {/* Calendar */}
        <div className="mt-4 rounded-tile border border-foreground/7 bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => canPrev && setViewMonth((m) => addMonths(m, -1))}
              disabled={!canPrev}
              className="flex h-8 w-8 items-center justify-center rounded-full text-primary-strong transition active:scale-[0.94] disabled:opacity-25"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[14px] font-bold tracking-[-0.02em] text-foreground">
              {format(viewMonth, "MMMM yyyy")}
            </span>
            <button
              type="button"
              onClick={() => canNext && setViewMonth((m) => addMonths(m, 1))}
              disabled={!canNext}
              className="flex h-8 w-8 items-center justify-center rounded-full text-primary-strong transition active:scale-[0.94] disabled:opacity-25"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="pb-1 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-foreground/35">
                {d}
              </div>
            ))}
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {monthDays.map((day) => {
              const iso = format(day, "yyyy-MM-dd");
              const st = stateFor(iso);
              const isToday = iso === todayIso;
              const isSelected = iso === selectedIso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedIso(iso)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-[11px] text-[13px] tabular-nums transition active:scale-[0.92]",
                    cellClass[st],
                    isToday && "ring-2 ring-accent ring-offset-1 ring-offset-white",
                    isSelected && !isToday && "ring-2 ring-primary-strong ring-offset-1 ring-offset-white",
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-foreground/6 pt-3 text-[10px] font-medium text-foreground/55">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[5px] bg-primary" />Worked out</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[5px] bg-foreground/[0.08]" />Rest day</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[5px] ring-1 ring-inset ring-accent/45" />Missed</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[5px] ring-2 ring-accent" />Today</span>
          </div>
        </div>

        {/* Selected day detail */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="text-[15px] font-bold tracking-[-0.02em] text-foreground">
              {format(parseISO(selectedIso), "EEEE, d MMM")}
            </h2>
            {selectedState === "done" ? (
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">Trained</span>
            ) : selectedState === "rest" ? (
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/40">Rest day</span>
            ) : selectedState === "missed" ? (
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent">Missed</span>
            ) : (
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/35">Upcoming</span>
            )}
          </div>

          {selectedState === "done" ? (
            exerciseGroups.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {exerciseGroups.map((group) => (
                  <div key={group.name} className="rounded-chip border border-foreground/7 bg-white px-4 py-3 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-bold text-foreground">{group.name}</p>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {group.sets.length} {group.sets.length === 1 ? "set" : "sets"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.sets.map((set) => (
                        <span key={set.id} className="rounded-[9px] bg-foreground/[0.04] px-2.5 py-1 text-[11px] font-semibold text-foreground/70 tabular-nums">
                          {set.reps ?? "–"}×{formatLoad(set.loadValue)}{set.loadUnit}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-chip border border-foreground/7 bg-white px-4 py-4 text-[13px] text-foreground/55 shadow-card">
                Session completed{selectedLog?.effort ? ` · ${selectedLog.effort} effort` : ""}. No individual sets were logged.
              </div>
            )
          ) : (
            <div className="mt-3 rounded-chip border border-foreground/7 bg-white px-4 py-4 text-[13px] text-foreground/55 shadow-card">
              {selectedState === "rest"
                ? "A scheduled rest day. Recovery is part of the plan."
                : selectedState === "missed"
                  ? "No workout logged on this day."
                  : selectedState === "pre"
                    ? "Before your plan started."
                    : "This day is still ahead. Keep going."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
