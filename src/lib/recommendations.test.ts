import { describe, expect, it } from "vitest";
import { buildMealParseResultFromAiSelection } from "@/lib/meal-ai";
import { parseMealText } from "@/lib/meal-parser";
import { foodCatalog } from "@/lib/nutrition-dataset";
import {
  calculateNutritionTargets,
  DAILY_WATER_TARGET_L,
  getGoalCalculationDetails,
  generateWorkoutPlan,
  normalizeProfile,
  withStandardWaterTarget,
} from "@/lib/recommendations";
import {
  getAdaptedWorkoutSession,
  getReadinessWorkoutAdjustment,
} from "@/lib/readiness";
import type { OnboardingInput } from "@/lib/types";

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
  secondaryFocus: "Legs and glutes",
  workoutEnvironment: "home",
  preferredWorkoutDays: 4,
  preferredWorkoutTime: "Evening",
  equipmentAccess: ["Yoga mat", "Dumbbells"],
  injuries: [],
  foodFlags: {
    eatsMeat: false,
    eatsEggs: false,
    eatsDairy: true,
  },
  allergies: [],
  dislikedFoods: [],
};

describe("recommendations", () => {
  it("builds nutrition targets for muscle gain", () => {
    const targets = calculateNutritionTargets(normalizeProfile(sampleInput));

    expect(targets.calories).toBeGreaterThan(2000);
    expect(targets.proteinG).toBeGreaterThan(140);
    expect(targets.carbsG).toBeGreaterThan(200);
    expect(targets.meta.equation).toBe("mifflin-st-jeor");
    expect(targets.meta.calorieAdjustmentPercent).toBeGreaterThanOrEqual(5);
    expect(targets.meta.calorieAdjustmentPercent).toBeLessThanOrEqual(15);
  });

  it("derives weekly pace and calorie adjustment from saved goal timeline", () => {
    const details = getGoalCalculationDetails(normalizeProfile(sampleInput));

    expect(details.durationMonths).toBe(2.5);
    expect(details.paceKgPerWeek).toBeGreaterThan(0.3);
    expect(details.dailyCalorieAdjustment).toBeGreaterThan(0);
    expect(details.calorieAdjustmentPercent).toBeGreaterThanOrEqual(5);
    expect(details.calorieAdjustmentPercent).toBeLessThanOrEqual(15);
  });

  it("creates a weekly workout plan with active sessions", () => {
    const plan = generateWorkoutPlan(normalizeProfile(sampleInput));
    const activeSessions = plan.dailySessions.filter((session) => !session.isRestDay);

    expect(activeSessions).toHaveLength(4);
    expect(activeSessions[0]?.exercises.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps Basic users on the base workout after readiness", () => {
    const plan = generateWorkoutPlan(normalizeProfile(sampleInput));
    const session = plan.dailySessions.find((item) => !item.isRestDay) ?? null;
    const adapted = getAdaptedWorkoutSession({
      environment: "home",
      readinessLog: {
        date: "2026-06-04",
        sleepHours: 4,
        energyLevel: 3,
        muscleSoreness: 8,
        stressLevel: 8,
        loggedAt: "2026-06-04T08:00:00.000Z",
      },
      session,
      subscriptionTier: "starter",
    });

    expect(adapted?.isAdaptedForReadiness).toBe(false);
    expect(adapted?.durationMin).toBe(session?.durationMin);
    expect(adapted?.exercises).toHaveLength(session?.exercises.length ?? 0);
  });

  it("adapts Pro workouts for low readiness", () => {
    const plan = generateWorkoutPlan(normalizeProfile(sampleInput));
    const session = plan.dailySessions.find((item) => !item.isRestDay) ?? null;
    const adjusted = getReadinessWorkoutAdjustment({
      sleepHours: 5.5,
      energyLevel: 4,
      muscleSoreness: 6,
    });
    const adapted = getAdaptedWorkoutSession({
      environment: "home",
      readinessLog: {
        date: "2026-06-04",
        sleepHours: 5.5,
        energyLevel: 4,
        muscleSoreness: 6,
        stressLevel: 8,
        loggedAt: "2026-06-04T08:00:00.000Z",
      },
      session,
      subscriptionTier: "pro",
    });

    expect(adjusted.mode).toBe("lighter");
    expect(adapted?.isAdaptedForReadiness).toBe(true);
    expect(adapted?.durationMin).toBeLessThanOrEqual(45);
    expect(adapted?.exercises.length).toBeLessThanOrEqual(session?.exercises.length ?? 99);
  });

  it("keeps rest days as rest days even for Pro readiness", () => {
    const plan = generateWorkoutPlan(normalizeProfile(sampleInput));
    const restSession = plan.dailySessions.find((session) => session.isRestDay) ?? null;
    const adapted = getAdaptedWorkoutSession({
      environment: "home",
      readinessLog: {
        date: "2026-06-04",
        sleepHours: 4,
        energyLevel: 3,
        muscleSoreness: 8,
        stressLevel: 8,
        loggedAt: "2026-06-04T08:00:00.000Z",
      },
      session: restSession,
      subscriptionTier: "pro",
    });

    expect(adapted?.isRestDay).toBe(true);
    expect(adapted?.isAdaptedForReadiness).toBe(false);
  });

  it("includes the expanded regional Indian and international food coverage", () => {
    expect(foodCatalog.length).toBeGreaterThanOrEqual(220);
    expect(foodCatalog.some((item) => item.id === "poha")).toBe(true);
    expect(foodCatalog.some((item) => item.id === "margherita-pizza")).toBe(true);
  });

  it("parses a common India-first meal phrase", () => {
    const parsed = parseMealText(
      "2 roti, paneer sabji, and a glass of milk",
      "dinner",
    );

    expect(parsed.parsedItems).toHaveLength(3);
    expect(parsed.estimatedNutrition.proteinG).toBeGreaterThan(25);
    expect(parsed.confidence).toBeGreaterThan(0.9);
  });

  it("converts gram-based rajma and rice entries into realistic servings", () => {
    const parsed = parseMealText(
      "100 gram rajma and 100 gram rice",
      "lunch",
    );

    expect(parsed.parsedItems).toHaveLength(2);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.estimatedNutrition.calories).toBeLessThan(300);
    expect(parsed.estimatedNutrition.proteinG).toBeLessThan(20);
    expect(parsed.estimatedNutrition.carbsG).toBeLessThan(60);
  });

  it("parses 100gm soya bean salad without exploding nutrients", () => {
    const parsed = parseMealText("100gm soya bean salad", "lunch");

    expect(parsed.parsedItems).toHaveLength(1);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.estimatedNutrition.calories).toBe(170);
    expect(parsed.estimatedNutrition.proteinG).toBe(16);
    expect(parsed.estimatedNutrition.carbsG).toBe(12);
  });

  it("parses mixed gram-based soyabean with dahi correctly", () => {
    const parsed = parseMealText("50gm soyabean with 60gm dahi", "lunch");

    expect(parsed.parsedItems).toHaveLength(2);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.estimatedNutrition.calories).toBe(111);
    expect(parsed.estimatedNutrition.proteinG).toBeCloseTo(10.3, 5);
    expect(parsed.estimatedNutrition.carbsG).toBeCloseTo(6.2, 5);
    expect(parsed.estimatedNutrition.fatsG).toBeCloseTo(5.5, 5);
  });

  it("parses soyabean with cucumber and onion as separate ingredients", () => {
    const parsed = parseMealText("65gm soyabean with cucumber and onion", "dinner");

    expect(parsed.parsedItems).toHaveLength(3);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.parsedItems.map((item) => item.name)).toEqual([
      "Soybean",
      "Cucumber",
      "Onion",
    ]);
    expect(parsed.estimatedNutrition.calories).toBe(132);
    expect(parsed.estimatedNutrition.proteinG).toBeCloseTo(12.5, 5);
    expect(parsed.estimatedNutrition.carbsG).toBeCloseTo(10.1, 5);
    expect(parsed.estimatedNutrition.fatsG).toBeCloseTo(5.6, 5);
  });

  it("parses milliliter-based milk portions without exploding nutrients", () => {
    const parsed = parseMealText("oats 45g, milk 250ml, banana 1", "breakfast");

    expect(parsed.parsedItems).toHaveLength(3);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.parsedItems.map((item) => item.name)).toEqual([
      "Raw Oats",
      "Milk",
      "Banana",
    ]);
    expect(parsed.estimatedNutrition.calories).toBe(412);
    expect(parsed.estimatedNutrition.proteinG).toBeCloseTo(15.1, 1);
    expect(parsed.estimatedNutrition.carbsG).toBeCloseTo(70, 1);
  });

  it("parses paneer sandwich from the seeded dataset", () => {
    const parsed = parseMealText("100gm paneer sandwich", "lunch");

    expect(parsed.parsedItems).toHaveLength(1);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.estimatedNutrition.calories).toBe(265);
    expect(parsed.estimatedNutrition.proteinG).toBe(14);
    expect(parsed.estimatedNutrition.carbsG).toBe(24);
    expect(parsed.estimatedNutrition.fatsG).toBe(13);
  });

  it("parses gram-based besan chilla from the India-first dataset", () => {
    const parsed = parseMealText("125gm besan chilla", "breakfast");

    expect(parsed.parsedItems).toHaveLength(1);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.estimatedNutrition.calories).toBe(225);
    expect(parsed.estimatedNutrition.proteinG).toBe(11.3);
    expect(parsed.estimatedNutrition.carbsG).toBe(27.5);
    expect(parsed.estimatedNutrition.fatsG).toBe(7.5);
  });

  it("parses semolina pasta instead of leaving it at zero nutrition", () => {
    const parsed = parseMealText("200gm semolina pasta", "lunch");

    expect(parsed.parsedItems).toHaveLength(1);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.estimatedNutrition.calories).toBe(314);
    expect(parsed.estimatedNutrition.proteinG).toBe(11.6);
    expect(parsed.estimatedNutrition.carbsG).toBe(62);
    expect(parsed.estimatedNutrition.fatsG).toBe(2.4);
  });

  it("parses banana shake ingredients including peanut butter spoons", () => {
    const parsed = parseMealText(
      "banana shake with 150ml milk, 1 spoon peanut butter, 50gm oats",
      "snack",
    );

    expect(parsed.parsedItems).toHaveLength(4);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.parsedItems.map((item) => item.name)).toEqual([
      "Banana",
      "Milk",
      "Peanut Butter",
      "Raw Oats",
    ]);
    expect(parsed.estimatedNutrition.calories).toBe(470);
    expect(parsed.estimatedNutrition.proteinG).toBeCloseTo(16.4, 1);
    expect(parsed.estimatedNutrition.carbsG).toBeCloseTo(71.6, 1);
    expect(parsed.estimatedNutrition.fatsG).toBeCloseTo(14.5, 1);
  });

  it("keeps oatmeal and porridge mapped to the cooked oats entry", () => {
    const parsed = parseMealText("1 bowl oatmeal", "breakfast");

    expect(parsed.parsedItems).toHaveLength(1);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.parsedItems[0]?.name).toBe("Oats Bowl");
    expect(parsed.estimatedNutrition.calories).toBe(190);
    expect(parsed.estimatedNutrition.proteinG).toBeCloseTo(6.1, 1);
  });

  it("parses a newly added regional Indian dish from the supplemental catalog", () => {
    const parsed = parseMealText("1 bowl poha", "breakfast");

    expect(parsed.parsedItems).toHaveLength(1);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.estimatedNutrition.calories).toBeGreaterThan(200);
  });

  it("parses a newly added international popular food", () => {
    const parsed = parseMealText("margherita pizza", "lunch");

    expect(parsed.parsedItems).toHaveLength(1);
    expect(parsed.unrecognizedSegments).toHaveLength(0);
    expect(parsed.estimatedNutrition.calories).toBeGreaterThan(250);
  });

  it("leaves unsupported gram-based foods unmatched instead of inventing servings", () => {
    const parsed = parseMealText("100 gram smoothie", "snack");

    expect(parsed.parsedItems).toHaveLength(0);
    expect(parsed.unrecognizedSegments).toEqual(["100 gram smoothie"]);
    expect(parsed.estimatedNutrition.calories).toBe(0);
  });

  it("respects serving-based foods that already include multiple pieces", () => {
    const parsed = parseMealText("2 eggs", "breakfast");

    expect(parsed.parsedItems).toHaveLength(1);
    expect(parsed.estimatedNutrition.calories).toBe(144);
    expect(parsed.estimatedNutrition.proteinG).toBe(12);
  });

  it("builds nutrients deterministically from AI catalog selections", () => {
    const parsed = buildMealParseResultFromAiSelection(
      {
        items: [
          {
            catalogId: "rajma",
            quantity: 100,
            unit: "gram",
            matchedText: "100 gram rajma",
            confidence: 0.93,
          },
          {
            catalogId: "rice",
            quantity: 100,
            unit: "gram",
            matchedText: "100 gram rice",
            confidence: 0.95,
          },
        ],
        unmatchedItems: [],
      },
      "lunch",
    );

    expect(parsed.parsedItems).toHaveLength(2);
    expect(parsed.estimatedNutrition.calories).toBeLessThan(300);
    expect(parsed.estimatedNutrition.proteinG).toBeLessThan(20);
    expect(parsed.estimatedNutrition.carbsG).toBeLessThan(60);
  });
});

describe("daily water target", () => {
  it("is the same 2.5L for every user, whatever their sex", () => {
    for (const sex of ["male", "female", "non-binary"] as const) {
      const targets = calculateNutritionTargets(normalizeProfile({ ...sampleInput, sex }));
      expect(targets.micros.waterL).toBe(DAILY_WATER_TARGET_L);
      expect(targets.keyMicros.find((micro) => micro.name === "water")?.target).toBe(
        DAILY_WATER_TARGET_L,
      );
    }
  });

  it("moves targets saved with the old sex-based value onto 2.5L", () => {
    const current = calculateNutritionTargets(normalizeProfile(sampleInput));
    const saved = {
      ...current,
      micros: { ...current.micros, waterL: 3.7 },
      keyMicros: current.keyMicros.map((micro) =>
        micro.name === "water" ? { ...micro, target: 3.7 } : micro,
      ),
    };

    const migrated = withStandardWaterTarget(saved);

    expect(migrated.micros.waterL).toBe(2.5);
    expect(migrated.keyMicros.find((micro) => micro.name === "water")?.target).toBe(2.5);
    // Nothing else about the targets changes.
    expect(migrated.calories).toBe(saved.calories);
    expect(migrated.micros.ironMg).toBe(saved.micros.ironMg);
  });

  it("leaves targets already on 2.5L untouched", () => {
    const current = calculateNutritionTargets(normalizeProfile(sampleInput));
    expect(withStandardWaterTarget(current)).toBe(current);
  });
});
