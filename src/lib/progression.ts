import { addDays, format, parseISO } from "date-fns";
import { clamp, startOfTodayIso } from "@/lib/utils";
import type {
  DietFitState,
  MealLog,
  NutritionTargets,
  ProgressionDecision,
  ProgressionState,
  UserProfile,
  WeeklyProgressionReport,
  WeeklyProgressionSignals,
  WorkoutLoadLog,
  WorkoutLog,
  WorkoutPlan,
} from "@/lib/types";

const HISTORY_LIMIT = 12;
const EFFORT_SCORE = { easy: 1, steady: 2, push: 3 } as const;

export const defaultProgressionState: ProgressionState = {
  lastAppliedWeekStart: null,
  history: [],
};

export function normalizeProgressionState(
  value: Partial<ProgressionState> | null | undefined,
): ProgressionState {
  return {
    lastAppliedWeekStart: value?.lastAppliedWeekStart ?? null,
    history: Array.isArray(value?.history) ? value.history : [],
  };
}

/** Monday-based week start for a yyyy-MM-dd date string. */
export function getWeekStartIso(dateIso: string) {
  const date = parseISO(dateIso);
  const offset = (date.getDay() + 6) % 7;

  return format(addDays(date, -offset), "yyyy-MM-dd");
}

function isInWeek(dateIso: string, weekStartIso: string) {
  const weekEndIso = format(addDays(parseISO(weekStartIso), 6), "yyyy-MM-dd");

  return dateIso >= weekStartIso && dateIso <= weekEndIso;
}

type RepsParts = { sets: number; low: number; high: number };

function parseReps(reps: string): RepsParts | null {
  const match = reps.match(/^(\d+)\s*x\s*(\d+)(?:\s*-\s*(\d+))?$/i);

  if (!match) {
    return null;
  }

  const low = Number(match[2]);

  return {
    sets: Number(match[1]),
    low,
    high: match[3] ? Number(match[3]) : low,
  };
}

function formatReps({ sets, low, high }: RepsParts) {
  return low === high ? `${sets} x ${low}` : `${sets} x ${low}-${high}`;
}

/** Double progression: extend the rep range, then add a set and reset. */
export function progressRepsText(reps: string) {
  const parsed = parseReps(reps);

  if (!parsed) {
    const rounds = reps.match(/^(\d+)\s*rounds$/i);

    if (rounds && Number(rounds[1]) < 6) {
      return { next: `${Number(rounds[1]) + 1} rounds`, changed: true };
    }

    return { next: reps, changed: false };
  }

  if (parsed.high < 15) {
    return {
      next: formatReps({ ...parsed, low: parsed.low + 2, high: parsed.high + 2 }),
      changed: true,
    };
  }

  if (parsed.sets < 4) {
    return { next: formatReps({ sets: parsed.sets + 1, low: 8, high: 10 }), changed: true };
  }

  return { next: reps, changed: false };
}

export function reduceSetsText(reps: string) {
  const parsed = parseReps(reps);

  if (!parsed) {
    const rounds = reps.match(/^(\d+)\s*rounds$/i);

    if (rounds && Number(rounds[1]) > 2) {
      return { next: `${Number(rounds[1]) - 1} rounds`, changed: true };
    }

    return { next: reps, changed: false };
  }

  if (parsed.sets > 2) {
    return { next: formatReps({ ...parsed, sets: parsed.sets - 1 }), changed: true };
  }

  return { next: reps, changed: false };
}

export function calculateWeeklyMealQuality(
  mealLogs: MealLog[],
  targets: NutritionTargets | null,
  weekStartIso: string,
) {
  const dailyTotals = new Map<string, { calories: number; proteinG: number }>();

  mealLogs.forEach((log) => {
    const dateIso = log.loggedAt.slice(0, 10);

    if (!isInWeek(dateIso, weekStartIso)) {
      return;
    }

    const existing = dailyTotals.get(dateIso) ?? { calories: 0, proteinG: 0 };
    dailyTotals.set(dateIso, {
      calories: existing.calories + log.estimatedNutrition.calories,
      proteinG: existing.proteinG + log.estimatedNutrition.proteinG,
    });
  });

  const daysLogged = dailyTotals.size;

  if (!targets || daysLogged === 0) {
    return { score: 0, proteinAdherence: 0, calorieAdherence: 0, daysLogged };
  }

  const days = Array.from(dailyTotals.values());
  const avgCalories = days.reduce((total, day) => total + day.calories, 0) / daysLogged;
  const avgProtein = days.reduce((total, day) => total + day.proteinG, 0) / daysLogged;

  const proteinAdherence = targets.proteinG > 0 ? avgProtein / targets.proteinG : 0;
  const calorieDeviation =
    targets.calories > 0 ? Math.abs(avgCalories - targets.calories) / targets.calories : 1;
  const calorieAdherence = Math.max(0, 1 - calorieDeviation / 0.3);

  const score = Math.round(
    30 * Math.min(1, daysLogged / 5) +
      40 * Math.min(1, proteinAdherence) +
      30 * calorieAdherence,
  );

  return { score, proteinAdherence, calorieAdherence, daysLogged };
}

export function buildWeeklySignals(args: {
  plan: WorkoutPlan;
  workoutLogs: WorkoutLog[];
  workoutLoadLogs: WorkoutLoadLog[];
  mealLogs: MealLog[];
  nutritionTargets: NutritionTargets | null;
  weekStartIso: string;
}): WeeklyProgressionSignals {
  const { plan, weekStartIso } = args;
  const plannedSessions = plan.dailySessions.filter((session) => !session.isRestDay).length;

  const weekLogs = args.workoutLogs.filter((log) => isInWeek(log.sessionDate, weekStartIso));
  const completedSessions = weekLogs.filter((log) => log.completedSession).length;
  const partialSessions = weekLogs.filter(
    (log) => !log.completedSession && log.exercisesCompleted.length > 0,
  ).length;
  const adherence =
    plannedSessions > 0
      ? clamp((completedSessions + partialSessions * 0.5) / plannedSessions, 0, 1)
      : 0;

  const efforts = weekLogs
    .filter((log) => log.completedSession)
    .map((log) => EFFORT_SCORE[log.effort] ?? 2);
  const averageEffort =
    efforts.length > 0
      ? efforts.reduce((total, value) => total + value, 0) / efforts.length
      : null;

  // Exercises where every logged set reached 10+ reps → ready for more load.
  const setsByExercise = new Map<string, WorkoutLoadLog[]>();
  args.workoutLoadLogs
    .filter((log) => isInWeek(log.sessionDate, weekStartIso) && log.reps !== null)
    .forEach((log) => {
      const sets = setsByExercise.get(log.exerciseName) ?? [];
      sets.push(log);
      setsByExercise.set(log.exerciseName, sets);
    });

  const loadProgressExercises: string[] = [];
  setsByExercise.forEach((sets, exerciseName) => {
    if (sets.length >= 2 && sets.every((set) => (set.reps ?? 0) >= 10)) {
      loadProgressExercises.push(exerciseName);
    }
  });

  const mealQuality = calculateWeeklyMealQuality(
    args.mealLogs,
    args.nutritionTargets,
    weekStartIso,
  );

  return {
    plannedSessions,
    completedSessions,
    adherence,
    averageEffort,
    loadProgressExercises,
    mealQualityScore: mealQuality.score,
    proteinAdherence: mealQuality.proteinAdherence,
    calorieAdherence: mealQuality.calorieAdherence,
    daysMealsLogged: mealQuality.daysLogged,
  };
}

const muscleGoals = new Set(["build-muscle", "target-body-area", "competition-prep"]);

export function decideProgression(
  signals: WeeklyProgressionSignals,
  profile: UserProfile,
): { decision: ProgressionDecision; reasons: string[] } {
  const reasons: string[] = [];

  if (signals.adherence < 0.4) {
    reasons.push(
      `You completed ${signals.completedSessions} of ${signals.plannedSessions} planned sessions, so this week is about rebuilding the habit with shorter sessions.`,
    );

    return { decision: "rebuild", reasons };
  }

  if (signals.adherence < 0.75) {
    reasons.push(
      "Solid effort, but consistency comes before volume. The plan holds steady until you hit most sessions in a week.",
    );

    return { decision: "hold", reasons };
  }

  if (signals.averageEffort !== null && signals.averageEffort >= 2.7) {
    reasons.push(
      "You hit your sessions but everything felt like a max push. This week trims a set so you can recover and come back stronger.",
    );

    return { decision: "deload", reasons };
  }

  if (muscleGoals.has(profile.primaryGoal) && signals.proteinAdherence < 0.6) {
    reasons.push(
      "Workouts are consistent, but protein intake is well under target. Volume holds until food supports muscle growth. Aim for your daily protein target.",
    );

    return { decision: "hold", reasons };
  }

  reasons.push(
    "You hit your sessions with effort to spare, so this week adds volume.",
  );

  if (signals.mealQualityScore >= 70) {
    reasons.push("Nutrition is on point, which supports the heavier week.");
  }

  return { decision: "progress", reasons };
}

const decisionLabels: Record<ProgressionDecision, string> = {
  progress: "Progressed",
  hold: "Holding steady",
  deload: "Deload week",
  rebuild: "Rebuild week",
};

export function progressWorkoutPlan(
  plan: WorkoutPlan,
  decision: ProgressionDecision,
  signals: WeeklyProgressionSignals,
): { plan: WorkoutPlan; changes: string[] } {
  const changes: string[] = [];

  if (decision === "hold") {
    return { plan, changes };
  }

  const repsBumpedExercises: { name: string; before: string; after: string }[] = [];
  const setsReducedExercises: { name: string; before: string; after: string }[] = [];

  const dailySessions = plan.dailySessions.map((session) => {
    if (session.isRestDay) {
      return session;
    }

    const exercises = session.exercises.map((exercise) => {
      if (exercise.type === "warmup" || exercise.type === "mobility") {
        return exercise;
      }

      if (decision === "progress") {
        const { next, changed } = progressRepsText(exercise.reps);

        if (changed) {
          repsBumpedExercises.push({ name: exercise.name, before: exercise.reps, after: next });
          return { ...exercise, reps: next };
        }

        return exercise;
      }

      // deload and rebuild both pull volume back
      const { next, changed } = reduceSetsText(exercise.reps);

      if (changed) {
        setsReducedExercises.push({ name: exercise.name, before: exercise.reps, after: next });
        return { ...exercise, reps: next };
      }

      return exercise;
    });

    const durationMin =
      decision === "progress"
        ? clamp(session.durationMin + 3, 20, 60)
        : decision === "deload"
          ? clamp(session.durationMin - 5, 25, 60)
          : clamp(session.durationMin - 10, 20, 35);

    return { ...session, exercises, durationMin };
  });

  const MAX_NAMED_EXERCISES = 4;

  function describeExerciseChanges(
    exercises: { name: string; before: string; after: string }[],
    formatLine: (exercise: { name: string; before: string; after: string }) => string,
  ) {
    const uniqueByName = Array.from(
      new Map(exercises.map((exercise) => [exercise.name, exercise])).values(),
    );

    uniqueByName.slice(0, MAX_NAMED_EXERCISES).forEach((exercise) => {
      changes.push(formatLine(exercise));
    });

    const remaining = uniqueByName.length - MAX_NAMED_EXERCISES;

    if (remaining > 0) {
      changes.push(`+${remaining} more exercise slots adjusted across the week.`);
    }
  }

  if (repsBumpedExercises.length > 0) {
    describeExerciseChanges(
      repsBumpedExercises,
      (exercise) => `${exercise.name}: ${exercise.before} → ${exercise.after}`,
    );
  }

  if (setsReducedExercises.length > 0) {
    describeExerciseChanges(
      setsReducedExercises,
      (exercise) =>
        decision === "deload"
          ? `${exercise.name}: ${exercise.before} → ${exercise.after} (one set removed to recover)`
          : `${exercise.name}: ${exercise.before} → ${exercise.after} (trimmed to make this easier)`,
    );
  }

  if (decision === "progress") {
    signals.loadProgressExercises.slice(0, 3).forEach((exerciseName) => {
      changes.push(
        `${exerciseName}: you hit the top of the rep range on every set. Add ~2.5 kg next time.`,
      );
    });
  }

  if (decision === "rebuild") {
    changes.push("Sessions shortened to 35 minutes or less to make showing up easier.");
  }

  return { plan: { ...plan, dailySessions }, changes };
}

export function buildProgressionNotes(
  decision: ProgressionDecision,
  signals: WeeklyProgressionSignals,
) {
  const notes = [
    `Last week: ${signals.completedSessions}/${signals.plannedSessions} sessions, meal quality ${signals.mealQualityScore}/100.`,
  ];

  if (decision === "progress") {
    notes.push("Volume is up this week. Keep 1-2 reps in reserve on the first set.");
  } else if (decision === "deload") {
    notes.push("Lighter week on purpose. Move well, sleep well, and reset.");
  } else if (decision === "rebuild") {
    notes.push("Short sessions this week. The only goal is to show up.");
  } else {
    notes.push("Plan unchanged this week. Nail consistency and it progresses next week.");
  }

  if (signals.proteinAdherence > 0 && signals.proteinAdherence < 0.8) {
    notes.push("Protein is below target. Anchor each meal with dal, paneer, eggs, tofu, chicken, or curd.");
  }

  return notes;
}

/**
 * Checks whether a completed week needs to be processed and, if so, returns the
 * next app state with the progressed plan and a report. Returns null when
 * nothing needs to change.
 */
export function runWeeklyProgressionCheck(
  state: DietFitState,
  todayIso = startOfTodayIso(),
): DietFitState | null {
  if (!state.onboardingCompleted || !state.profile || !state.workoutPlan) {
    return null;
  }

  const progression = normalizeProgressionState(state.progression);
  const currentWeekStart = getWeekStartIso(todayIso);

  if (progression.lastAppliedWeekStart === currentWeekStart) {
    return null;
  }

  const previousWeekStart = format(
    addDays(parseISO(currentWeekStart), -7),
    "yyyy-MM-dd",
  );

  // No prior week of app usage yet — just mark this week as processed.
  const appStartedAt = state.profile.appStartedAt ?? todayIso;
  const hasWeekData =
    state.workoutLogs.some((log) => isInWeek(log.sessionDate, previousWeekStart)) ||
    state.mealLogs.some((log) => isInWeek(log.loggedAt.slice(0, 10), previousWeekStart));

  if (getWeekStartIso(appStartedAt) >= currentWeekStart || !hasWeekData) {
    return {
      ...state,
      progression: { ...progression, lastAppliedWeekStart: currentWeekStart },
    };
  }

  const signals = buildWeeklySignals({
    plan: state.workoutPlan,
    workoutLogs: state.workoutLogs,
    workoutLoadLogs: state.workoutLoadLogs ?? [],
    mealLogs: state.mealLogs,
    nutritionTargets: state.nutritionTargets,
    weekStartIso: previousWeekStart,
  });

  const { decision, reasons } = decideProgression(signals, state.profile);
  const { plan, changes } = progressWorkoutPlan(state.workoutPlan, decision, signals);

  const report: WeeklyProgressionReport = {
    weekStartIso: previousWeekStart,
    appliedAtIso: new Date().toISOString(),
    decision,
    decisionLabel: decisionLabels[decision],
    coachSummary: reasons.join(" "),
    changes,
    signals,
  };

  return {
    ...state,
    workoutPlan: {
      ...plan,
      progressionNotes: buildProgressionNotes(decision, signals),
    },
    progression: {
      lastAppliedWeekStart: currentWeekStart,
      history: [report, ...progression.history].slice(0, HISTORY_LIMIT),
    },
  };
}

/** Latest report, only if it was applied for the current week. */
export function getActiveProgressionReport(
  progression: ProgressionState | undefined,
  todayIso = startOfTodayIso(),
) {
  const normalized = normalizeProgressionState(progression);
  const latest = normalized.history[0];

  if (!latest) {
    return null;
  }

  const currentWeekStart = getWeekStartIso(todayIso);
  const reportTargetWeek = format(
    addDays(parseISO(latest.weekStartIso), 7),
    "yyyy-MM-dd",
  );

  return reportTargetWeek === currentWeekStart ? latest : null;
}
