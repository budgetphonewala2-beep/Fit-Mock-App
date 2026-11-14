import { differenceInCalendarDays, parseISO } from "date-fns";
import { toLocalIsoDate } from "@/lib/utils";
import type { WorkoutLoadLog, WorkoutLog } from "@/lib/types";

export type StreakTier = "spark" | "ember" | "gold" | "elite";

/**
 * The ladder. Everything past 30 repeats in the elite treatment with the number
 * swapped, so the list is generated rather than hand-written -- a 200-day streak
 * should not need a code change.
 */
export const STREAK_LADDER = [3, 7, 14, 30, 60, 100] as const;

export type StreakMilestoneCopy = {
  /** Renders across two lines on the takeover; \n is the intended break. */
  headline: string;
  /** The line under the headline. Null on the tiers that show tiles instead. */
  support: string | null;
  /** Shown when the milestone is demoted to a toast instead of the takeover. */
  toast: string;
};

/**
 * Copy per rung.
 *
 * The day-14 and day-30 support lines are non-comparative on purpose. The
 * handoff asked for "longer than 80% of members ever hold" and "top 4%", which
 * need cohort aggregation that does not exist -- hardcoding them would show
 * every user the same unmeasured claim about other people.
 */
export const STREAK_MILESTONE_COPY: Record<number, StreakMilestoneCopy> = {
  3: {
    headline: "Three days\nstrong",
    support: null,
    toast: "Three days banked. The habit is starting to hold.",
  },
  7: {
    headline: "A full week",
    support: null,
    toast: "Seven days without a gap.",
  },
  14: {
    headline: "Fortnight\nlocked in",
    support: "Two weeks without a single gap.",
    toast: "Two weeks without a single gap.",
  },
  30: {
    headline: "Thirty days.\nNo excuses.",
    support: "A month of showing up, without a single reset.",
    toast: "A month of showing up, without a single reset.",
  },
  60: {
    headline: "Sixty days.\nNo excuses.",
    support: "Two months of showing up, without a single reset.",
    toast: "Two months of showing up, without a single reset.",
  },
  100: {
    headline: "One hundred days.\nNo excuses.",
    support: "One hundred days of showing up, without a single reset.",
    toast: "One hundred days of showing up, without a single reset.",
  },
};

export function streakTierFor(days: number): StreakTier {
  if (days >= 30) return "elite";
  if (days >= 14) return "gold";
  if (days >= 7) return "ember";
  return "spark";
}

/**
 * The day the current streak run began.
 *
 * This is what scopes a milestone to its run. A streak of 5 on the 12th started
 * on the 8th, so every milestone earned in that run shares the key `2026-08-08`
 * and stays claimed for as long as the run lasts. Break the streak and the next
 * run gets a new key, which is what lets day 3 land again -- milestones are
 * per-run, not once per lifetime.
 */
export function streakRunStart(streak: number, today: string): string | null {
  if (streak < 1) {
    return null;
  }

  const start = new Date(`${today}T00:00:00`);
  start.setDate(start.getDate() - (streak - 1));

  return toLocalIsoDate(start);
}

export type StreakStat = { value: string; label: string };

/**
 * Day 30's two stat chips.
 *
 * Deliberately about the person rather than the cohort: there is no aggregation
 * backend, so a "top 4% of members" claim would be a number nobody measured,
 * shown identically to everyone. These are counted from the run itself.
 */
export function streakRunStats(args: {
  streak: number;
  runStart: string;
  workoutLogs: WorkoutLog[];
  workoutLoadLogs: WorkoutLoadLog[];
}): StreakStat[] {
  const { streak, runStart, workoutLogs, workoutLoadLogs } = args;

  const workoutDates = new Set(
    [
      ...workoutLogs
        .filter((log) => log.completedSession || log.exercisesCompleted.length > 0)
        .map((log) => log.sessionDate),
      ...workoutLoadLogs.map((log) => log.sessionDate),
    ].filter((date) => date >= runStart),
  );

  return [
    { value: `${streak} days`, label: "NO RESET" },
    {
      value: `${workoutDates.size}`,
      label: workoutDates.size === 1 ? "WORKOUT THIS RUN" : "WORKOUTS THIS RUN",
    },
  ];
}

export type DayReceipt = {
  label: string;
  /** The milestone day itself -- the hero tile, styled apart from the rest. */
  isToday: boolean;
};

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * The banked-day tiles on days 3 and 7. Every day in the run up to the
 * milestone is banked by definition -- that is what a streak is -- so these
 * label the days rather than re-deriving whether each one counted.
 */
export function streakReceipts(args: {
  milestone: number;
  runStart: string;
  short: boolean;
}): DayReceipt[] {
  const { milestone, runStart, short } = args;
  const start = parseISO(runStart);

  return Array.from({ length: milestone }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    const weekday = date.getDay();

    return {
      label: short ? WEEKDAY_INITIALS[weekday] : WEEKDAY_SHORT[weekday],
      isToday: index === milestone - 1,
    };
  });
}

/** Days elapsed since the run began, used only for sanity checks in tests. */
export function daysIntoRun(runStart: string, today: string) {
  return differenceInCalendarDays(parseISO(today), parseISO(runStart)) + 1;
}
