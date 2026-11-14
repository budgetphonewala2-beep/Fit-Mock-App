import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type {
  DietFitState,
  GoalCycleHardestPart,
  GoalCycleStats,
  MealLog,
  UserProfile,
  WorkoutLog,
} from "@/lib/types";
import { clamp, toLocalIsoDate } from "@/lib/utils";

export const DAYS_PER_MONTH = 30.4375;

// A cycle closes on the first open after its last day, and someone who drifted
// away weeks ago should not be handed a celebration and a four-step form.
const RECENT_ACTIVITY_WINDOW_DAYS = 14;
const ENGAGED_MIN_ACTIVE_DAYS = 5;

export type GoalCyclePosition = {
  startedOn: string;
  endsOn: string;
  totalDays: number;
  /** Clamped to the cycle length -- what "Day N of M" should read. */
  dayNumber: number;
  /** Uncapped, so a finished cycle stays distinguishable from its last day. */
  rawDayNumber: number;
  daysLeft: number;
  weekNumber: number;
  monthNumber: number;
  progress: number;
  isFinalDay: boolean;
  isComplete: boolean;
};

export function getGoalCycleTotalDays(
  profile: Pick<UserProfile, "goalDurationMonths">,
) {
  return Math.max(1, Math.round((profile.goalDurationMonths ?? 3) * DAYS_PER_MONTH));
}

export function getGoalCycle(
  profile: Pick<UserProfile, "appStartedAt" | "goalDurationMonths">,
  todayIso: string,
): GoalCyclePosition {
  const startedOn = profile.appStartedAt ?? todayIso;
  const totalDays = getGoalCycleTotalDays(profile);
  const elapsedDays = Math.max(
    0,
    differenceInCalendarDays(parseISO(todayIso), parseISO(startedOn)),
  );
  const rawDayNumber = elapsedDays + 1;
  const dayNumber = Math.min(rawDayNumber, totalDays);
  const endsOn = toLocalIsoDate(addDays(parseISO(startedOn), totalDays - 1));

  return {
    startedOn,
    endsOn,
    totalDays,
    dayNumber,
    rawDayNumber,
    daysLeft: Math.max(0, totalDays - rawDayNumber + 1),
    weekNumber: Math.floor((dayNumber - 1) / 7) + 1,
    monthNumber: Math.floor((dayNumber - 1) / DAYS_PER_MONTH) + 1,
    progress: clamp((dayNumber / totalDays) * 100, 0, 100),
    isFinalDay: rawDayNumber === totalDays,
    isComplete: rawDayNumber > totalDays,
  };
}

export type GoalCycleSummary = GoalCycleStats & {
  lastActiveOn: string | null;
  daysSinceLastActive: number | null;
  wasEngaged: boolean;
};

function isWithinCycle(dateIso: string, cycle: GoalCyclePosition) {
  return dateIso >= cycle.startedOn && dateIso <= cycle.endsOn;
}

function countBestStreak(activeDates: string[]) {
  let best = 0;
  let run = 0;
  let previous: string | null = null;

  activeDates.forEach((date) => {
    const isConsecutive =
      previous !== null &&
      differenceInCalendarDays(parseISO(date), parseISO(previous)) === 1;

    run = isConsecutive ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  });

  return best;
}

/**
 * Everything the wrap-up shows before it asks anything. All of it comes from
 * logs the user already wrote -- asking them to rate their own adherence when
 * we can count it reads as an app that wasn't paying attention.
 */
export function summarizeGoalCycle(
  logs: { mealLogs: MealLog[]; workoutLogs: WorkoutLog[] },
  cycle: GoalCyclePosition,
  todayIso: string,
): GoalCycleSummary {
  const mealDates = logs.mealLogs
    .map((log) => toLocalIsoDate(new Date(log.loggedAt)))
    .filter((date) => isWithinCycle(date, cycle));
  const workoutDates = logs.workoutLogs
    .filter((log) => log.completedSession && isWithinCycle(log.sessionDate, cycle))
    .map((log) => log.sessionDate);

  const daysMealsLogged = new Set(mealDates).size;
  const activeDates = Array.from(new Set([...mealDates, ...workoutDates])).sort();
  const lastActiveOn = activeDates.length > 0 ? activeDates[activeDates.length - 1] : null;
  const daysSinceLastActive = lastActiveOn
    ? Math.max(0, differenceInCalendarDays(parseISO(todayIso), parseISO(lastActiveOn)))
    : null;
  // Adherence is measured against the days the cycle actually ran, not against
  // a cycle length the user may not have reached yet.
  const daysElapsed = clamp(cycle.rawDayNumber, 1, cycle.totalDays);

  return {
    activeDays: activeDates.length,
    daysMealsLogged,
    mealsLogged: mealDates.length,
    workoutsCompleted: workoutDates.length,
    bestStreak: countBestStreak(activeDates),
    adherencePercent: Math.round((activeDates.length / daysElapsed) * 100),
    lastActiveOn,
    daysSinceLastActive,
    wasEngaged:
      activeDates.length >= ENGAGED_MIN_ACTIVE_DAYS &&
      daysSinceLastActive !== null &&
      daysSinceLastActive <= RECENT_ACTIVITY_WINDOW_DAYS,
  };
}

export function hasReviewedCycle(state: DietFitState, cycle: GoalCyclePosition) {
  return (state.goalReviews ?? []).some(
    (review) => review.cycleStartedOn === cycle.startedOn,
  );
}

export function needsGoalReview(state: DietFitState, todayIso: string) {
  if (!state.profile || !state.onboardingCompleted || !state.paywallCompleted) {
    return false;
  }

  const cycle = getGoalCycle(state.profile, todayIso);

  return cycle.isComplete && !hasReviewedCycle(state, cycle);
}

const EASIER_EXPERIENCE: Record<
  UserProfile["fitnessExperience"],
  UserProfile["fitnessExperience"] | null
> = {
  advanced: "intermediate",
  intermediate: "returning",
  returning: "beginner",
  beginner: null,
};

export type HardestPartAdjustment = {
  changes: Partial<UserProfile>;
  /** What the user is told will be different next cycle. */
  label: string;
};

/**
 * Turns the "what was hardest" answer into a real change to the next cycle.
 * Only two of the four have a lever in the plan generator; the other two are
 * recorded and surfaced rather than dressed up as a plan change that isn't one.
 */
export function getHardestPartAdjustment(
  profile: UserProfile,
  hardestPart: GoalCycleHardestPart | null,
): HardestPartAdjustment {
  if (hardestPart === "time") {
    const nextDays = Math.max(2, profile.preferredWorkoutDays - 1);

    return nextDays === profile.preferredWorkoutDays
      ? { changes: {}, label: "Sessions stay short, since you're already at the lightest week." }
      : {
          changes: { preferredWorkoutDays: nextDays },
          label: `Next cycle drops to ${nextDays} training days a week, with shorter sessions.`,
        };
  }

  if (hardestPart === "workouts") {
    const easier = EASIER_EXPERIENCE[profile.fitnessExperience];

    if (easier) {
      return {
        changes: { fitnessExperience: easier },
        label: "Next cycle rebuilds from simpler movements you can hold form on.",
      };
    }

    const nextDays = Math.max(2, profile.preferredWorkoutDays - 1);

    return nextDays === profile.preferredWorkoutDays
      ? { changes: {}, label: "Your coach will lead with training this cycle." }
      : {
          changes: { preferredWorkoutDays: nextDays },
          label: `Next cycle drops to ${nextDays} training days a week.`,
        };
  }

  if (hardestPart === "diet") {
    return { changes: {}, label: "Your coach will lead with food this cycle." };
  }

  if (hardestPart === "motivation") {
    return {
      changes: { commitmentLevel: "need-a-push" },
      label: "Your coach will check in harder when you go quiet.",
    };
  }

  return { changes: {}, label: "" };
}

/**
 * The weight the cycle was aiming at, or null for goals that are not weight
 * targets -- endurance and body-area cycles have no number to land on.
 */
export function getCycleTargetWeightKg(
  profile: Pick<UserProfile, "primaryGoal" | "weightKg" | "goalTargetKg">,
) {
  const targetKg = profile.goalTargetKg;

  if (targetKg === undefined || targetKg === null) {
    return null;
  }

  if (profile.primaryGoal === "build-muscle") {
    return Math.round((profile.weightKg + targetKg) * 10) / 10;
  }

  if (profile.primaryGoal === "lose-weight") {
    return Math.round(Math.max(0, profile.weightKg - targetKg) * 10) / 10;
  }

  if (profile.primaryGoal === "maintain") {
    return profile.weightKg;
  }

  return null;
}

/**
 * The plan page headline, e.g. "Lose 5 kg in 91 days". Weight goals name the
 * change and the cycle length; other goals have no number, so they get null
 * and the caller falls back to the goal summary.
 */
export function getCycleGoalHeadline(
  profile: Pick<UserProfile, "primaryGoal" | "weightKg" | "goalTargetKg">,
  totalDays: number,
) {
  const changeKg = Math.round((profile.goalTargetKg ?? 0) * 10) / 10;
  const days = `${totalDays} ${totalDays === 1 ? "day" : "days"}`;

  if (profile.primaryGoal === "lose-weight" && changeKg > 0) {
    return `Lose ${changeKg} kg in ${days}`;
  }
  if (profile.primaryGoal === "build-muscle" && changeKg > 0) {
    return `Gain ${changeKg} kg in ${days}`;
  }
  if (profile.primaryGoal === "maintain") {
    return `Hold ${profile.weightKg} kg for ${days}`;
  }
  return null;
}

export function getWeightDeltaKg(review: {
  startWeightKg: number;
  endWeightKg: number | null;
}) {
  return review.endWeightKg === null
    ? null
    : Math.round((review.endWeightKg - review.startWeightKg) * 10) / 10;
}
