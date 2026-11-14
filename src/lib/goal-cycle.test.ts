import { describe, expect, it } from "vitest";
import {
  getCycleGoalHeadline,
  getCycleTargetWeightKg,
  getGoalCycle,
  getHardestPartAdjustment,
  getWeightDeltaKg,
  needsGoalReview,
  summarizeGoalCycle,
} from "@/lib/goal-cycle";
import { normalizeProfile } from "@/lib/recommendations";
import type {
  DietFitState,
  GoalCycleReview,
  MealLog,
  OnboardingInput,
  UserProfile,
  WorkoutLog,
} from "@/lib/types";

const sampleInput: OnboardingInput = {
  name: "Aarav",
  age: 28,
  sex: "male",
  heightCm: 178,
  weightKg: 77,
  goalTargetKg: 5,
  // 55 days, matching the screenshot's "Day 55 of 55".
  goalDurationMonths: 1.8,
  exerciseFrequency: "4-5 days / week",
  fitnessExperience: "intermediate",
  commitmentLevel: "steady",
  primaryGoal: "build-muscle",
  secondaryFocus: "Upper body",
  workoutEnvironment: "gym",
  preferredWorkoutDays: 4,
  preferredWorkoutTime: "Morning",
  equipmentAccess: ["Dumbbells", "Barbell"],
  injuries: [],
  foodFlags: { eatsMeat: true, eatsDairy: true, eatsEggs: true },
  allergies: [],
  dislikedFoods: [],
};

const profile: UserProfile = {
  ...normalizeProfile(sampleInput),
  appStartedAt: "2026-06-01",
};

function makeMealLog(dateIso: string, index = 0): MealLog {
  return {
    id: `meal-${dateIso}-${index}`,
    rawText: "test meal",
    parsedItems: [],
    mealType: "lunch",
    loggedAt: `${dateIso}T12:30:00.000Z`,
    estimatedNutrition: {
      calories: 500,
      proteinG: 30,
      carbsG: 40,
      fatsG: 15,
      fiberG: 5,
      micros: {},
    },
    confidence: 1,
    coachTip: "",
  };
}

function makeWorkoutLog(sessionDate: string, completedSession = true): WorkoutLog {
  return {
    id: `workout-${sessionDate}`,
    sessionDate,
    sessionId: "monday-upper-body",
    exercisesCompleted: ["a", "b"],
    completedSession,
    effort: "steady",
    notes: "",
  };
}

function makeState(overrides: Partial<DietFitState> = {}): DietFitState {
  return {
    authMode: "demo",
    userEmail: "demo@fitmonk.app",
    subscriptionTier: "starter",
    onboardingCompleted: true,
    paywallCompleted: true,
    profile,
    nutritionTargets: null,
    workoutPlan: null,
    coachNote: "",
    mealLogs: [],
    waterLogs: [],
    workoutLogs: [],
    workoutLoadLogs: [],
    readinessLogs: [],
    workoutPreferences: {
      selectedMuscleFocusByDate: {},
      savedGymRoutinesByFocus: {},
      savedGymRoutineNamesByFocus: {},
      savedCustomRoutines: [],
      selectedCustomRoutineByDate: {},
      draftGymRoutinesByDate: {},
      customGymWorkoutsByDate: {},
    homeSessionMinutesByDate: {},
      dailyReadinessDismissedByDate: {},
    },
    mealSuggestions: [],
    achievements: [],
    streak: 0,
    points: 0,
    progression: { lastAppliedWeekStart: null, history: [] },
    challengeEnrollments: [],
    ...overrides,
  };
}

function makeReview(overrides: Partial<GoalCycleReview> = {}): GoalCycleReview {
  return {
    cycleStartedOn: "2026-06-01",
    cycleEndedOn: "2026-07-25",
    totalDays: 55,
    primaryGoal: "build-muscle",
    startWeightKg: 77,
    goalTargetKg: 5,
    endWeightKg: 80,
    hardestPart: "time",
    satisfaction: 4,
    note: "",
    stoppedReason: null,
    wasEngaged: true,
    stats: {
      activeDays: 47,
      daysMealsLogged: 45,
      mealsLogged: 160,
      workoutsCompleted: 28,
      bestStreak: 12,
      adherencePercent: 85,
    },
    completedAt: "2026-07-26T08:00:00.000Z",
    ...overrides,
  };
}

describe("getGoalCycle", () => {
  it("counts 1.8 months as the 55-day cycle the plan screen shows", () => {
    expect(getGoalCycle(profile, "2026-06-01").totalDays).toBe(55);
  });

  it("reports the first day as day 1, not day 0", () => {
    const cycle = getGoalCycle(profile, "2026-06-01");

    expect(cycle.dayNumber).toBe(1);
    expect(cycle.daysLeft).toBe(55);
    expect(cycle.isComplete).toBe(false);
  });

  it("marks the last day as final without calling the cycle complete", () => {
    const cycle = getGoalCycle(profile, "2026-07-25");

    expect(cycle.dayNumber).toBe(55);
    expect(cycle.endsOn).toBe("2026-07-25");
    expect(cycle.isFinalDay).toBe(true);
    expect(cycle.isComplete).toBe(false);
    expect(cycle.daysLeft).toBe(1);
  });

  it("keeps counting past the end instead of pinning at the last day", () => {
    const cycle = getGoalCycle(profile, "2026-08-06");

    expect(cycle.dayNumber).toBe(55);
    expect(cycle.rawDayNumber).toBe(67);
    expect(cycle.isComplete).toBe(true);
    expect(cycle.daysLeft).toBe(0);
  });

  it("treats a profile with no start date as starting today", () => {
    const cycle = getGoalCycle({ ...profile, appStartedAt: undefined }, "2026-08-06");

    expect(cycle.startedOn).toBe("2026-08-06");
    expect(cycle.dayNumber).toBe(1);
    expect(cycle.isComplete).toBe(false);
  });
});

describe("summarizeGoalCycle", () => {
  const cycle = getGoalCycle(profile, "2026-07-26");

  it("counts distinct active days across meals and workouts", () => {
    const summary = summarizeGoalCycle(
      {
        mealLogs: [
          makeMealLog("2026-06-01", 0),
          makeMealLog("2026-06-01", 1),
          makeMealLog("2026-06-02"),
        ],
        workoutLogs: [makeWorkoutLog("2026-06-02"), makeWorkoutLog("2026-06-03")],
      },
      cycle,
      "2026-07-26",
    );

    expect(summary.mealsLogged).toBe(3);
    expect(summary.daysMealsLogged).toBe(2);
    expect(summary.workoutsCompleted).toBe(2);
    expect(summary.activeDays).toBe(3);
    expect(summary.bestStreak).toBe(3);
  });

  it("ignores logs from outside the cycle window", () => {
    const summary = summarizeGoalCycle(
      {
        mealLogs: [makeMealLog("2026-05-30"), makeMealLog("2026-06-05")],
        workoutLogs: [makeWorkoutLog("2026-07-30")],
      },
      cycle,
      "2026-07-26",
    );

    expect(summary.mealsLogged).toBe(1);
    expect(summary.activeDays).toBe(1);
    expect(summary.lastActiveOn).toBe("2026-06-05");
  });

  it("does not count workouts that were started but never finished", () => {
    const summary = summarizeGoalCycle(
      { mealLogs: [], workoutLogs: [makeWorkoutLog("2026-06-10", false)] },
      cycle,
      "2026-07-26",
    );

    expect(summary.workoutsCompleted).toBe(0);
    expect(summary.activeDays).toBe(0);
    expect(summary.adherencePercent).toBe(0);
  });

  it("calls a user who logged through the end engaged", () => {
    const mealLogs = Array.from({ length: 20 }, (_, index) =>
      makeMealLog(`2026-07-${String(index + 5).padStart(2, "0")}`),
    );
    const summary = summarizeGoalCycle({ mealLogs, workoutLogs: [] }, cycle, "2026-07-26");

    expect(summary.wasEngaged).toBe(true);
    expect(summary.daysSinceLastActive).toBe(2);
  });

  it("does not call someone who drifted away weeks ago engaged", () => {
    const mealLogs = Array.from({ length: 10 }, (_, index) =>
      makeMealLog(`2026-06-${String(index + 1).padStart(2, "0")}`),
    );
    const summary = summarizeGoalCycle({ mealLogs, workoutLogs: [] }, cycle, "2026-07-26");

    expect(summary.activeDays).toBe(10);
    expect(summary.wasEngaged).toBe(false);
  });

  it("treats a barely-started cycle as not engaged", () => {
    const summary = summarizeGoalCycle(
      { mealLogs: [makeMealLog("2026-07-25")], workoutLogs: [] },
      cycle,
      "2026-07-26",
    );

    expect(summary.wasEngaged).toBe(false);
  });
});

describe("needsGoalReview", () => {
  it("stays quiet while the cycle is still running", () => {
    expect(needsGoalReview(makeState(), "2026-07-25")).toBe(false);
  });

  it("asks once the cycle has run its length", () => {
    expect(needsGoalReview(makeState(), "2026-07-26")).toBe(true);
  });

  it("does not ask twice for the same cycle", () => {
    const state = makeState({ goalReviews: [makeReview()] });

    expect(needsGoalReview(state, "2026-07-26")).toBe(false);
  });

  it("asks again after a new cycle finishes", () => {
    const state = makeState({
      profile: { ...profile, appStartedAt: "2026-07-26" },
      goalReviews: [makeReview()],
    });

    expect(needsGoalReview(state, "2026-09-20")).toBe(true);
  });

  it("stays quiet before onboarding and paywall are done", () => {
    expect(needsGoalReview(makeState({ paywallCompleted: false }), "2026-07-26")).toBe(false);
    expect(needsGoalReview(makeState({ profile: null }), "2026-07-26")).toBe(false);
  });
});

describe("getHardestPartAdjustment", () => {
  it("drops a training day when time was the problem", () => {
    const adjustment = getHardestPartAdjustment(profile, "time");

    expect(adjustment.changes.preferredWorkoutDays).toBe(3);
    expect(adjustment.label).toContain("3 training days");
  });

  it("never drops below two training days", () => {
    const adjustment = getHardestPartAdjustment(
      { ...profile, preferredWorkoutDays: 2 },
      "time",
    );

    expect(adjustment.changes).toEqual({});
  });

  it("eases the movement set when the workouts themselves were the problem", () => {
    expect(getHardestPartAdjustment(profile, "workouts").changes.fitnessExperience).toBe(
      "returning",
    );
  });

  it("falls back to fewer days when there is no easier movement set", () => {
    const adjustment = getHardestPartAdjustment(
      { ...profile, fitnessExperience: "beginner" },
      "workouts",
    );

    expect(adjustment.changes.fitnessExperience).toBeUndefined();
    expect(adjustment.changes.preferredWorkoutDays).toBe(3);
  });

  it("records diet and motivation without inventing a plan change", () => {
    expect(getHardestPartAdjustment(profile, "diet").changes).toEqual({});
    expect(getHardestPartAdjustment(profile, "motivation").changes).toEqual({
      commitmentLevel: "need-a-push",
    });
  });

  it("changes nothing when the question was skipped", () => {
    const adjustment = getHardestPartAdjustment(profile, null);

    expect(adjustment.changes).toEqual({});
    expect(adjustment.label).toBe("");
  });
});

describe("getCycleTargetWeightKg", () => {
  it("adds the target for a muscle cycle and subtracts it for a loss cycle", () => {
    expect(getCycleTargetWeightKg(profile)).toBe(82);
    expect(
      getCycleTargetWeightKg({ ...profile, primaryGoal: "lose-weight" }),
    ).toBe(72);
  });

  it("has no target weight for goals that are not weight goals", () => {
    expect(
      getCycleTargetWeightKg({ ...profile, primaryGoal: "improve-endurance" }),
    ).toBeNull();
    expect(getCycleTargetWeightKg({ ...profile, goalTargetKg: undefined })).toBeNull();
  });
});

describe("getWeightDeltaKg", () => {
  it("reports the signed change", () => {
    expect(getWeightDeltaKg({ startWeightKg: 77, endWeightKg: 80.4 })).toBe(3.4);
    expect(getWeightDeltaKg({ startWeightKg: 80, endWeightKg: 76.5 })).toBe(-3.5);
  });

  it("stays null when the weigh-in was skipped", () => {
    expect(getWeightDeltaKg({ startWeightKg: 77, endWeightKg: null })).toBeNull();
  });
});

describe("getCycleGoalHeadline", () => {
  const base = { weightKg: 78, goalTargetKg: 5 };

  it("names the change and the cycle length for weight goals", () => {
    expect(getCycleGoalHeadline({ ...base, primaryGoal: "lose-weight" }, 91)).toBe("Lose 5 kg in 91 days");
    expect(getCycleGoalHeadline({ ...base, primaryGoal: "build-muscle" }, 61)).toBe("Gain 5 kg in 61 days");
    expect(getCycleGoalHeadline({ ...base, primaryGoal: "maintain" }, 91)).toBe("Hold 78 kg for 91 days");
  });

  it("has no headline without a number to aim at", () => {
    expect(getCycleGoalHeadline({ ...base, goalTargetKg: 0, primaryGoal: "lose-weight" }, 91)).toBeNull();
    expect(getCycleGoalHeadline({ ...base, primaryGoal: "improve-endurance" }, 91)).toBeNull();
  });
});
