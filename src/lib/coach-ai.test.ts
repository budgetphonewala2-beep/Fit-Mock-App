import { describe, expect, it } from "vitest";
import { buildCoachContext, removeEmDashes } from "@/lib/coach-ai";
import { normalizeProfile } from "@/lib/recommendations";
import type { DietFitState, GoalCycleReview, OnboardingInput } from "@/lib/types";

const sampleInput: OnboardingInput = {
  name: "Aarav",
  age: 28,
  sex: "male",
  heightCm: 178,
  weightKg: 77,
  goalTargetKg: 5,
  goalDurationMonths: 1.8,
  exerciseFrequency: "4-5 days / week",
  fitnessExperience: "intermediate",
  commitmentLevel: "steady",
  primaryGoal: "build-muscle",
  secondaryFocus: "Upper body",
  workoutEnvironment: "gym",
  preferredWorkoutDays: 4,
  preferredWorkoutTime: "Morning",
  equipmentAccess: ["Dumbbells"],
  injuries: [],
  foodFlags: { eatsMeat: true, eatsDairy: true, eatsEggs: true },
  allergies: [],
  dislikedFoods: [],
};

const review: GoalCycleReview = {
  cycleStartedOn: "2026-06-01",
  cycleEndedOn: "2026-07-25",
  totalDays: 55,
  primaryGoal: "build-muscle",
  startWeightKg: 72,
  goalTargetKg: 5,
  endWeightKg: 75.4,
  hardestPart: "diet",
  satisfaction: 3,
  note: "Evening meals were the problem.",
  stoppedReason: null,
  wasEngaged: true,
  stats: {
    activeDays: 47,
    daysMealsLogged: 45,
    mealsLogged: 141,
    workoutsCompleted: 28,
    bestStreak: 12,
    adherencePercent: 85,
  },
  completedAt: "2026-07-26T08:00:00.000Z",
};

function makeState(overrides: Partial<DietFitState> = {}): DietFitState {
  return {
    authMode: "demo",
    userEmail: "demo@fitmonk.app",
    subscriptionTier: "pro",
    onboardingCompleted: true,
    paywallCompleted: true,
    profile: { ...normalizeProfile(sampleInput), appStartedAt: "2026-07-26" },
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

describe("buildCoachContext lastGoalCycle", () => {
  it("hands the coach what the user said was hardest", () => {
    const context = buildCoachContext(makeState({ goalReviews: [review] }));

    expect(context.lastGoalCycle).toMatchObject({
      hardestPart: "diet",
      userNote: "Evening meals were the problem.",
      weightChangeKg: 3.4,
      adherencePercent: 85,
      wasEngaged: true,
    });
  });

  it("passes the churn reason through for someone who dropped off", () => {
    const context = buildCoachContext(
      makeState({
        goalReviews: [
          { ...review, wasEngaged: false, hardestPart: null, stoppedReason: "I got busy" },
        ],
      }),
    );

    expect(context.lastGoalCycle?.stoppedReason).toBe("I got busy");
    expect(context.lastGoalCycle?.wasEngaged).toBe(false);
  });

  it("keeps a skipped weigh-in distinguishable from no change", () => {
    const context = buildCoachContext(
      makeState({ goalReviews: [{ ...review, endWeightKg: null }] }),
    );

    expect(context.lastGoalCycle?.endWeightKg).toBeNull();
    expect(context.lastGoalCycle?.weightChangeKg).toBeNull();
  });

  it("is null before any cycle has closed", () => {
    expect(buildCoachContext(makeState()).lastGoalCycle).toBeNull();
    expect(buildCoachContext(makeState({ goalReviews: [] })).lastGoalCycle).toBeNull();
  });

  it("uses the most recent cycle when several have closed", () => {
    const older: GoalCycleReview = {
      ...review,
      cycleStartedOn: "2026-04-01",
      hardestPart: "time",
    };
    const context = buildCoachContext(makeState({ goalReviews: [review, older] }));

    expect(context.lastGoalCycle?.hardestPart).toBe("diet");
  });
});

describe("removeEmDashes", () => {
  it("turns a spaced or unspaced em dash into a comma", () => {
    expect(removeEmDashes("Great work — keep going")).toBe("Great work, keep going");
    expect(removeEmDashes("Protein first—then carbs")).toBe("Protein first, then carbs");
  });

  it("treats a spaced en dash the same way but keeps number ranges", () => {
    expect(removeEmDashes("Rest today – you earned it")).toBe("Rest today, you earned it");
    expect(removeEmDashes("Aim for 3–5 sets")).toBe("Aim for 3–5 sets");
  });

  it("doesn't leave a comma before other punctuation or at a line start", () => {
    expect(removeEmDashes("Pick one —.")).toBe("Pick one.");
    expect(removeEmDashes("— Start small")).toBe("Start small");
  });

  it("keeps paragraph breaks", () => {
    expect(removeEmDashes("You hit 6 of 7 days —\nnice.")).toBe("You hit 6 of 7 days,\nnice.");
  });
});
