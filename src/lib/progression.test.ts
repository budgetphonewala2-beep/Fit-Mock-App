import { describe, expect, it } from "vitest";
import {
  calculateWeeklyMealQuality,
  decideProgression,
  getActiveProgressionReport,
  getWeekStartIso,
  progressRepsText,
  progressWorkoutPlan,
  reduceSetsText,
  runWeeklyProgressionCheck,
} from "@/lib/progression";
import {
  calculateNutritionTargets,
  generateWorkoutPlan,
  normalizeProfile,
} from "@/lib/recommendations";
import type {
  DietFitState,
  MealLog,
  OnboardingInput,
  WeeklyProgressionSignals,
  WorkoutLog,
} from "@/lib/types";

const sampleInput: OnboardingInput = {
  name: "Aarav",
  age: 28,
  sex: "male",
  heightCm: 178,
  weightKg: 77,
  goalTargetKg: 4,
  goalDurationMonths: 2.5,
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

const profile = { ...normalizeProfile(sampleInput), appStartedAt: "2026-05-25" };
const targets = calculateNutritionTargets(profile);
const plan = generateWorkoutPlan(profile);

const baseSignals: WeeklyProgressionSignals = {
  plannedSessions: 4,
  completedSessions: 4,
  adherence: 1,
  averageEffort: 2,
  loadProgressExercises: [],
  mealQualityScore: 80,
  proteinAdherence: 1,
  calorieAdherence: 0.9,
  daysMealsLogged: 6,
};

function makeWorkoutLog(sessionDate: string, overrides: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id: `log-${sessionDate}`,
    sessionDate,
    sessionId: plan.dailySessions[0].id,
    exercisesCompleted: plan.dailySessions[0].exercises.map((exercise) => exercise.id),
    completedSession: true,
    effort: "steady",
    notes: "",
    ...overrides,
  };
}

function makeMealLog(loggedAt: string, calories: number, proteinG: number): MealLog {
  return {
    id: `meal-${loggedAt}`,
    rawText: "test meal",
    parsedItems: [],
    mealType: "lunch",
    loggedAt,
    estimatedNutrition: {
      calories,
      proteinG,
      carbsG: 0,
      fatsG: 0,
      fiberG: 0,
      micros: {},
    },
    confidence: 1,
    coachTip: "",
  };
}

function makeState(overrides: Partial<DietFitState>): DietFitState {
  return {
    authMode: "demo",
    userEmail: "demo@fitmonk.app",
    subscriptionTier: "starter",
    onboardingCompleted: true,
    paywallCompleted: true,
    profile,
    nutritionTargets: targets,
    workoutPlan: plan,
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

describe("getWeekStartIso", () => {
  it("returns Monday for any day of the week", () => {
    expect(getWeekStartIso("2026-06-12")).toBe("2026-06-08"); // Friday
    expect(getWeekStartIso("2026-06-08")).toBe("2026-06-08"); // Monday
    expect(getWeekStartIso("2026-06-14")).toBe("2026-06-08"); // Sunday
  });
});

describe("rep text progression", () => {
  it("extends the rep range first", () => {
    expect(progressRepsText("3 x 8-10")).toEqual({ next: "3 x 10-12", changed: true });
    expect(progressRepsText("3 x 10-12")).toEqual({ next: "3 x 12-14", changed: true });
  });

  it("adds a set and resets once the range is maxed", () => {
    expect(progressRepsText("3 x 13-15")).toEqual({ next: "4 x 8-10", changed: true });
  });

  it("caps at 4 sets", () => {
    expect(progressRepsText("4 x 13-15").changed).toBe(false);
  });

  it("progresses conditioning rounds", () => {
    expect(progressRepsText("4 rounds")).toEqual({ next: "5 rounds", changed: true });
  });

  it("leaves time-based work untouched", () => {
    expect(progressRepsText("5 minutes").changed).toBe(false);
  });

  it("reduces sets with a floor of 2", () => {
    expect(reduceSetsText("3 x 8-10")).toEqual({ next: "2 x 8-10", changed: true });
    expect(reduceSetsText("2 x 8-10").changed).toBe(false);
  });
});

describe("calculateWeeklyMealQuality", () => {
  it("scores high when protein and calories track targets", () => {
    const logs = [0, 1, 2, 3, 4].map((day) =>
      makeMealLog(
        `2026-06-0${day + 1}T12:00:00.000Z`,
        targets.calories,
        targets.proteinG,
      ),
    );
    const quality = calculateWeeklyMealQuality(logs, targets, "2026-06-01");

    expect(quality.score).toBeGreaterThanOrEqual(90);
    expect(quality.proteinAdherence).toBeCloseTo(1);
  });

  it("returns zero with no logs in the week", () => {
    const quality = calculateWeeklyMealQuality([], targets, "2026-06-01");

    expect(quality.score).toBe(0);
    expect(quality.daysLogged).toBe(0);
  });
});

describe("decideProgression", () => {
  it("progresses on high adherence with steady effort", () => {
    expect(decideProgression(baseSignals, profile).decision).toBe("progress");
  });

  it("holds on moderate adherence", () => {
    const { decision } = decideProgression(
      { ...baseSignals, adherence: 0.5, completedSessions: 2 },
      profile,
    );

    expect(decision).toBe("hold");
  });

  it("rebuilds on very low adherence", () => {
    const { decision } = decideProgression(
      { ...baseSignals, adherence: 0.25, completedSessions: 1 },
      profile,
    );

    expect(decision).toBe("rebuild");
  });

  it("deloads when every session was a max push", () => {
    const { decision } = decideProgression(
      { ...baseSignals, averageEffort: 3 },
      profile,
    );

    expect(decision).toBe("deload");
  });

  it("gates progression on protein for muscle-building goals", () => {
    const { decision, reasons } = decideProgression(
      { ...baseSignals, proteinAdherence: 0.4 },
      profile,
    );

    expect(decision).toBe("hold");
    expect(reasons.join(" ")).toMatch(/protein/i);
  });
});

describe("progressWorkoutPlan", () => {
  it("bumps reps on strength work when progressing", () => {
    const { plan: nextPlan, changes } = progressWorkoutPlan(plan, "progress", baseSignals);
    const sessionIndex = plan.dailySessions.findIndex((session) => !session.isRestDay);
    const originalStrength = plan.dailySessions[sessionIndex].exercises.find(
      (exercise) => exercise.type === "strength",
    );
    const nextStrength = nextPlan.dailySessions[sessionIndex].exercises.find(
      (exercise) => exercise.type === "strength",
    );

    expect(nextStrength?.reps).toBe(progressRepsText(originalStrength!.reps).next);
    expect(nextStrength?.reps).not.toBe(originalStrength?.reps);
    expect(changes.length).toBeGreaterThan(0);
  });

  it("does not mutate the original plan", () => {
    const before = JSON.stringify(plan);
    progressWorkoutPlan(plan, "progress", baseSignals);

    expect(JSON.stringify(plan)).toBe(before);
  });

  it("suggests load increases for exercises that hit top reps", () => {
    const { changes } = progressWorkoutPlan(plan, "progress", {
      ...baseSignals,
      loadProgressExercises: ["Goblet Squat"],
    });

    expect(changes.some((change) => change.includes("Goblet Squat"))).toBe(true);
  });

  it("shortens sessions on rebuild", () => {
    const { plan: nextPlan } = progressWorkoutPlan(plan, "rebuild", baseSignals);
    const active = nextPlan.dailySessions.filter((session) => !session.isRestDay);

    active.forEach((session) => {
      expect(session.durationMin).toBeLessThanOrEqual(35);
    });
  });

  it("keeps the plan unchanged on hold", () => {
    const { plan: nextPlan, changes } = progressWorkoutPlan(plan, "hold", baseSignals);

    expect(nextPlan).toBe(plan);
    expect(changes).toEqual([]);
  });
});

describe("runWeeklyProgressionCheck", () => {
  // today = Friday 2026-06-12, current week starts Monday 2026-06-08,
  // previous week = 2026-06-01 .. 2026-06-07
  const today = "2026-06-12";
  const previousWeekDays = ["2026-06-01", "2026-06-02", "2026-06-04", "2026-06-06"];

  it("applies progression after a strong week", () => {
    const state = makeState({
      workoutLogs: previousWeekDays.map((date) => makeWorkoutLog(date)),
      mealLogs: previousWeekDays.map((date) =>
        makeMealLog(`${date}T12:00:00.000Z`, targets.calories, targets.proteinG),
      ),
    });

    const next = runWeeklyProgressionCheck(state, today);

    expect(next).not.toBeNull();
    expect(next?.progression.lastAppliedWeekStart).toBe("2026-06-08");
    expect(next?.progression.history[0]?.decision).toBe("progress");
    expect(next?.workoutPlan).not.toEqual(state.workoutPlan);
  });

  it("is idempotent within the same week", () => {
    const state = makeState({
      workoutLogs: previousWeekDays.map((date) => makeWorkoutLog(date)),
    });

    const next = runWeeklyProgressionCheck(state, today);
    expect(next).not.toBeNull();
    expect(runWeeklyProgressionCheck(next!, today)).toBeNull();
  });

  it("marks the week processed without changes when there is no data", () => {
    const state = makeState({});
    const next = runWeeklyProgressionCheck(state, today);

    expect(next?.progression.lastAppliedWeekStart).toBe("2026-06-08");
    expect(next?.progression.history).toEqual([]);
    expect(next?.workoutPlan).toEqual(state.workoutPlan);
  });

  it("skips users in their first week", () => {
    const state = makeState({
      profile: { ...profile, appStartedAt: "2026-06-09" },
      workoutLogs: previousWeekDays.map((date) => makeWorkoutLog(date)),
    });

    const next = runWeeklyProgressionCheck(state, today);

    expect(next?.progression.history).toEqual([]);
  });

  it("exposes the active report for the current week", () => {
    const state = makeState({
      workoutLogs: previousWeekDays.map((date) => makeWorkoutLog(date)),
    });
    const next = runWeeklyProgressionCheck(state, today);

    expect(getActiveProgressionReport(next!.progression, today)).not.toBeNull();
    expect(getActiveProgressionReport(next!.progression, "2026-06-20")).toBeNull();
  });
});
