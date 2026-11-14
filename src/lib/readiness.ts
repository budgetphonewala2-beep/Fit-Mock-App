import { clamp, isProTier, startOfTodayIso } from "@/lib/utils";
import type {
  ReadinessLog,
  SubscriptionTier,
  WorkoutEnvironment,
  WorkoutSession,
} from "@/lib/types";

export type ReadinessInput = Pick<
  ReadinessLog,
  "sleepHours" | "energyLevel" | "muscleSoreness"
>;

export type ReadinessAdjustmentMode = "normal" | "balanced" | "lighter" | "recovery";

export type ReadinessWorkoutAdjustment = {
  mode: ReadinessAdjustmentMode;
  label: string;
  summary: string;
  proPreviewSummary: string;
  intensity: "high" | "moderate" | "moderate-low" | "low";
  score: number;
  // How many exercises a home session should include for this mode, always
  // clamped between MIN_HOME_EXERCISES and MAX_HOME_EXERCISES. Session
  // duration is derived from this (and the actual sets/reps involved)
  // rather than being a separate, disconnected estimate.
  exerciseTarget: number;
  setMultiplier: number;
  removeConditioning: boolean;
  volumeGuidance: string;
};

export type AdaptedWorkoutSession = WorkoutSession & {
  readinessAdjustment: ReadinessWorkoutAdjustment | null;
  isAdaptedForReadiness: boolean;
};

// A home session always has at least MIN_HOME_EXERCISES exercises (so a
// "recovery" day still feels like a workout) and never more than
// MAX_HOME_EXERCISES (every per-focus preset list tops out at 6, and more
// than that doesn't fit a reasonable home session anyway).
export const MIN_HOME_EXERCISES = 3;
export const MAX_HOME_EXERCISES = 6;

// Rough estimate per working set: ~45s of work plus ~45s of rest between
// sets. This is intentionally simple (no per-exercise tempo/rest data
// exists yet) but it ties the duration estimate to the exercises actually
// selected, instead of a fixed number disconnected from session content.
const SECONDS_PER_SET = 90;
const WARMUP_SECONDS = 5 * 60;

export function getReadinessForDate(
  readinessLogs: ReadinessLog[] | undefined,
  date = startOfTodayIso(),
) {
  return readinessLogs?.find((log) => log.date === date) ?? null;
}

// Scored on the three things the check-in still asks about, with the weight
// the stress question used to carry spread across them so the scale stays
// 0-100 and the thresholds below keep meaning what they meant.
export function calculateReadinessScore(log: ReadinessInput) {
  const sleepScore = Math.min(log.sleepHours / 8, 1) * 30;
  const energyScore = (log.energyLevel / 10) * 45;
  const sorenessScore = ((11 - log.muscleSoreness) / 10) * 25;

  return Math.round(sleepScore + energyScore + sorenessScore);
}

export function getReadinessWorkoutAdjustment(log: ReadinessInput): ReadinessWorkoutAdjustment {
  const score = calculateReadinessScore(log);

  if (score < 40 || log.muscleSoreness >= 8 || log.energyLevel <= 3 || log.sleepHours < 5) {
    return {
      mode: "recovery",
      label: "Recovery-biased",
      summary: "Today shifts to a short recovery session with light work only.",
      proPreviewSummary: "Pro would turn this into a short recovery session.",
      intensity: "low",
      score,
      exerciseTarget: MIN_HOME_EXERCISES,
      setMultiplier: 0.55,
      removeConditioning: true,
      volumeGuidance: "Keep everything easy. Skip heavy loading and stop well before fatigue.",
    };
  }

  if (score >= 78 && log.energyLevel >= 7 && log.muscleSoreness < 7) {
    return {
      mode: "normal",
      label: "Push-ready",
      summary: "Keep the full plan and add intensity only if form stays clean.",
      proPreviewSummary: "Pro would keep the full session today.",
      intensity: "high",
      score,
      exerciseTarget: MAX_HOME_EXERCISES,
      setMultiplier: 1,
      removeConditioning: false,
      volumeGuidance: "Run the full plan. Add intensity only if your form stays clean.",
    };
  }

  if (score < 60 || log.energyLevel <= 5 || log.sleepHours < 6.5) {
    return {
      mode: "lighter",
      label: "Lighter day",
      summary: "Today becomes a shorter, easier session with optional finishers removed.",
      proPreviewSummary: "Pro would make this a shorter, lighter session.",
      intensity: "moderate-low",
      score,
      exerciseTarget: MIN_HOME_EXERCISES + 1,
      setMultiplier: 0.7,
      removeConditioning: true,
      volumeGuidance: "Reduce sets by about a third and keep 2-3 reps in reserve.",
    };
  }

  return {
    mode: "balanced",
    label: "Balanced",
    summary: "Run the planned session with normal rests and clean pacing.",
    proPreviewSummary: "Pro would keep this close to the full plan with clean pacing.",
    intensity: "moderate",
    score,
    exerciseTarget: MAX_HOME_EXERCISES - 1,
    setMultiplier: 0.9,
    removeConditioning: true,
    volumeGuidance: "Stay steady. Skip optional finishers if form or energy dips.",
  };
}

export function getReadinessAdjustment(log: ReadinessInput) {
  return getReadinessWorkoutAdjustment(log);
}

function scaleSetsInText(reps: string, multiplier: number) {
  if (multiplier >= 0.98) {
    return reps;
  }

  return reps.replace(/^(\d+)\s*x\s*/i, (_match, sets: string) => {
    const nextSets = Math.max(1, Math.round(Number(sets) * multiplier));
    return `${nextSets} x `;
  });
}

function parseSetCount(reps: string) {
  const match = reps.match(/^(\d+)\s*x/i);
  return match ? Math.max(1, Number(match[1])) : 3;
}

// Estimates total session length from the exercises actually selected,
// instead of a fixed per-mode constant. Keeps the displayed duration and
// the displayed exercise list honest with each other.
export function estimateSessionDurationMin(exercises: { reps: string }[]) {
  const workSeconds = exercises.reduce(
    (total, exercise) => total + parseSetCount(exercise.reps) * SECONDS_PER_SET,
    0,
  );

  return Math.max(15, Math.round((WARMUP_SECONDS + workSeconds) / 60));
}

export function adaptExerciseForReadiness<
  T extends { type: string; reps: string; guidance: string },
>(exercise: T, adjustment: ReadinessWorkoutAdjustment): T {
  if (adjustment.mode === "normal") {
    return exercise;
  }

  return {
    ...exercise,
    reps:
      exercise.type === "warmup" || /minute|min|sec/i.test(exercise.reps)
        ? exercise.reps
        : scaleSetsInText(exercise.reps, adjustment.setMultiplier),
    guidance: `${exercise.guidance} ${adjustment.volumeGuidance}`,
  };
}

// Single source of truth for "which exercises does a readiness-adapted
// home session include." Used both for the exercise cards rendered on
// screen and for the duration estimate shown alongside them, so the two
// can never drift out of sync the way they used to.
export function selectAdaptedExercises<T extends { type: string; reps: string }>(
  exercises: T[],
  adjustment: ReadinessWorkoutAdjustment,
  getName: (exercise: T) => string,
): T[] {
  if (adjustment.mode === "normal") {
    return exercises.slice(0, MAX_HOME_EXERCISES);
  }

  const nonConditioning = adjustment.removeConditioning
    ? exercises.filter((exercise) => exercise.type !== "conditioning")
    : exercises;

  const recoveryPreferred =
    adjustment.mode === "recovery"
      ? nonConditioning.filter(
          (exercise) =>
            exercise.type === "warmup" ||
            exercise.type === "mobility" ||
            /mobility|stretch|walk|dead bug|plank|core/i.test(getName(exercise)),
        )
      : nonConditioning;

  const pool = recoveryPreferred.length > 0 ? recoveryPreferred : nonConditioning;
  const targetCount = clamp(adjustment.exerciseTarget, MIN_HOME_EXERCISES, MAX_HOME_EXERCISES);

  return pool.slice(0, Math.min(targetCount, pool.length || targetCount));
}

export function getAdaptedWorkoutSession({
  environment,
  readinessLog,
  session,
  subscriptionTier,
}: {
  environment?: WorkoutEnvironment;
  readinessLog: ReadinessLog | null;
  session: WorkoutSession | null;
  subscriptionTier: SubscriptionTier;
}): AdaptedWorkoutSession | null {
  if (!session) {
    return null;
  }

  if (!readinessLog || !isProTier(subscriptionTier) || session.isRestDay || environment === "gym") {
    return {
      ...session,
      readinessAdjustment: readinessLog ? getReadinessWorkoutAdjustment(readinessLog) : null,
      isAdaptedForReadiness: false,
    };
  }

  const adjustment = getReadinessWorkoutAdjustment(readinessLog);
  const adaptedExercises = selectAdaptedExercises(
    session.exercises,
    adjustment,
    (exercise) => exercise.name,
  ).map((exercise) => adaptExerciseForReadiness(exercise, adjustment));

  return {
    ...session,
    title: adjustment.mode === "normal" ? session.title : `${adjustment.label}: ${session.title}`,
    durationMin: estimateSessionDurationMin(adaptedExercises),
    note: `${adjustment.summary} ${adjustment.volumeGuidance}`,
    exercises: adaptedExercises,
    readinessAdjustment: adjustment,
    isAdaptedForReadiness: adjustment.mode !== "normal",
  };
}
