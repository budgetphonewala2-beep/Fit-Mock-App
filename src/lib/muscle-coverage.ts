import type { WorkoutLoadLog, WorkoutLog } from "@/lib/types";

export type MuscleGroupId =
  | "glutes"
  | "hamstrings"
  | "calves"
  | "lower-back"
  | "quads"
  | "shoulders"
  | "forearms"
  | "core"
  | "chest"
  | "back"
  | "biceps"
  | "triceps";

export type MuscleCoverageState = "fresh" | "due" | "neglected";

export type MuscleCoverageEntry = {
  id: MuscleGroupId;
  label: string;
  // Days since this group was last trained, or null when it has never been.
  daysSince: number | null;
  state: MuscleCoverageState;
  // 0-1, for the bar under each group. Full when trained today, empty at the
  // point where a group counts as long neglected.
  freshness: number;
};

// Trained within this many days reads as fresh; at or past the neglected
// threshold a group stops counting towards coverage.
const FRESH_WITHIN_DAYS = 2;
const NEGLECTED_AFTER_DAYS = 7;
const EMPTY_BAR_AFTER_DAYS = 10;

// Matched against "<exerciseId> <title> <target>". Every rule that matches gets
// the credit, so the broad patterns carry an `exclude` for the movements they
// would otherwise swallow: a leg curl is hamstrings, not biceps, and a bench
// dip is triceps, not chest.
const MUSCLE_GROUP_RULES: {
  id: MuscleGroupId;
  label: string;
  pattern: RegExp;
  exclude?: RegExp;
}[] = [
  { id: "lower-back", label: "Lower back", pattern: /lower.?back|hyperextension|superman|good.?morning|back.?extension/ },
  { id: "hamstrings", label: "Hamstrings", pattern: /hamstring|leg.?curl|romanian|deadlift|nordic/ },
  { id: "glutes", label: "Glutes", pattern: /glute|hip.?thrust|bridge|hip.?abduct|donkey/ },
  { id: "calves", label: "Calves", pattern: /calf|calves|heel.?raise/ },
  { id: "quads", label: "Quads", pattern: /quad|squat|lunge|leg.?press|leg.?extension|step.?up|wall.?sit/ },
  { id: "forearms", label: "Forearms", pattern: /forearm|wrist|reverse.?curl|grip|farmer/ },
  { id: "triceps", label: "Triceps", pattern: /tricep|skull.?crusher|pushdown|kickback|dip|close.?grip|overhead.?extension/ },
  {
    id: "biceps",
    label: "Biceps",
    pattern: /bicep|curl/,
    exclude: /leg.?curl|reverse.?curl|nordic/,
  },
  { id: "shoulders", label: "Shoulders", pattern: /shoulder|delt|lateral.?raise|front.?raise|arnold|overhead.?press|face.?pull|upright.?row/ },
  {
    id: "chest",
    label: "Chest",
    pattern: /chest|bench|push.?up|pec|fly|flye|floor.?press/,
    exclude: /bench.?dip|close.?grip/,
  },
  {
    id: "back",
    label: "Back",
    pattern: /\bback\b|row|pull.?up|pull.?down|\blat\b|lats|chin.?up|shrug|trap/,
    exclude: /lower.?back|back.?extension|face.?pull/,
  },
  { id: "core", label: "Core", pattern: /core|\babs\b|plank|crunch|dead.?bug|hollow|leg.?raise|oblique|sit.?up|mountain.?climber|russian|bicycle/ },
];

export const MUSCLE_GROUP_COUNT = MUSCLE_GROUP_RULES.length;

// An exercise can train several groups -- a deadlift is hamstrings and back --
// so every rule that matches gets the credit rather than just the first.
export function getMuscleGroupsForExercise(...parts: (string | undefined)[]) {
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();

  return MUSCLE_GROUP_RULES.filter(
    (rule) => rule.pattern.test(haystack) && !rule.exclude?.test(haystack),
  ).map((rule) => rule.id);
}

function daysBetween(fromIso: string, toIso: string) {
  const from = Date.parse(`${fromIso}T00:00:00`);
  const to = Date.parse(`${toIso}T00:00:00`);

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return null;
  }

  return Math.round((to - from) / 86_400_000);
}

function toState(daysSince: number | null): MuscleCoverageState {
  if (daysSince === null || daysSince >= NEGLECTED_AFTER_DAYS) {
    return "neglected";
  }

  return daysSince <= FRESH_WITHIN_DAYS ? "fresh" : "due";
}

// Logs only carry exercise ids, and those ids are slugified names
// ("dumbbell-bicep-curl-home-preset"), so they carry enough signal to match on
// without a second lookup table to keep in sync.
export function getMuscleCoverage({
  workoutLogs,
  workoutLoadLogs,
  today,
}: {
  workoutLogs: WorkoutLog[];
  workoutLoadLogs?: WorkoutLoadLog[];
  today: string;
}): MuscleCoverageEntry[] {
  const lastTrained = new Map<MuscleGroupId, number>();

  const credit = (sessionDate: string, ...parts: (string | undefined)[]) => {
    const daysSince = daysBetween(sessionDate, today);

    if (daysSince === null || daysSince < 0) {
      return;
    }

    for (const groupId of getMuscleGroupsForExercise(...parts)) {
      const current = lastTrained.get(groupId);

      if (current === undefined || daysSince < current) {
        lastTrained.set(groupId, daysSince);
      }
    }
  };

  for (const log of workoutLogs) {
    for (const exerciseId of log.exercisesCompleted) {
      credit(log.sessionDate, exerciseId);
    }
  }

  for (const log of workoutLoadLogs ?? []) {
    credit(log.sessionDate, log.exerciseId, log.exerciseName);
  }

  return MUSCLE_GROUP_RULES.map((rule) => {
    const daysSince = lastTrained.get(rule.id) ?? null;

    return {
      id: rule.id,
      label: rule.label,
      daysSince,
      state: toState(daysSince),
      freshness:
        daysSince === null
          ? 0
          : Math.max(0, 1 - Math.min(daysSince, EMPTY_BAR_AFTER_DAYS) / EMPTY_BAR_AFTER_DAYS),
    };
  }).sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity));
}

export function getMuscleCoverageScore(entries: MuscleCoverageEntry[]) {
  return entries.filter((entry) => entry.state !== "neglected").length;
}

export function getMuscleCoverageSummary(entry: MuscleCoverageEntry) {
  if (entry.daysSince === null) {
    return "Complete 1 week of session to see your muscle coverage stats";
  }

  if (entry.state === "neglected") {
    return "Neglected, nothing logged in over a week";
  }

  if (entry.daysSince === 0) {
    return "Trained today, give it time to recover";
  }

  return entry.state === "fresh"
    ? `Trained ${entry.daysSince}d ago, still fresh`
    : `Due, last trained ${entry.daysSince}d ago`;
}
