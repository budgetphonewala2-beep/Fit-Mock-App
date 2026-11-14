import { describe, expect, it } from "vitest";
import {
  buildMealWithItems,
  findInconsistentDuplicates,
  getRecipeNutrition,
  isProteinAnchor,
  MAX_RECIPE_SCALE,
  MIN_RECIPE_SCALE,
  scaleRecipeToCalories,
  verifyMeal,
} from "@/lib/meal-plan-engine";
import { validateAiVariant } from "@/lib/meal-plan-ai";
import { getMealSlots } from "@/lib/meal-plan-recipes";
import { calculateNutritionTargets } from "@/lib/recommendations";
import type { DietTimelineMeal, UserProfile } from "@/lib/types";

/**
 * Regression guard for a trust bug: the same ingredients were shown as 24g
 * protein in one meal slot and 7g in another, because a meal's macros were a
 * share of the daily target instead of a property of its food.
 *
 * These tests assert the invariant that makes that impossible — a meal's macros
 * are always derived from its own catalog-priced ingredients.
 */

const baseProfile = {
  name: "Test",
  age: 30,
  sex: "male",
  heightCm: 178,
  weightKg: 78,
  activityLevel: "active",
  exerciseFrequency: "4-5 days",
  fitnessExperience: "intermediate",
  commitmentLevel: "high",
  secondaryFocus: "strength",
  workoutEnvironment: "gym",
  preferredWorkoutDays: 5,
  preferredWorkoutTime: "evening",
  equipmentAccess: [],
  injuries: [],
  allergies: [],
  dislikedFoods: [],
} as unknown as UserProfile;

const dietVariations = [
  { label: "vegan", eatsMeat: false, eatsDairy: false, eatsEggs: false },
  { label: "vegetarian", eatsMeat: false, eatsDairy: true, eatsEggs: false },
  { label: "eggetarian", eatsMeat: false, eatsDairy: true, eatsEggs: true },
  { label: "omnivore", eatsMeat: true, eatsDairy: true, eatsEggs: true },
];

const goalVariations = [
  { label: "lose-weight", primaryGoal: "lose-weight", weightKg: 95 },
  { label: "maintain", primaryGoal: "maintain", weightKg: 70 },
  { label: "build-muscle", primaryGoal: "build-muscle", weightKg: 60 },
];

function buildScenario(diet: (typeof dietVariations)[number], goal: (typeof goalVariations)[number]) {
  const profile = {
    ...baseProfile,
    primaryGoal: goal.primaryGoal,
    weightKg: goal.weightKg,
    foodFlags: { eatsMeat: diet.eatsMeat, eatsDairy: diet.eatsDairy, eatsEggs: diet.eatsEggs },
  } as UserProfile;

  const targets = calculateNutritionTargets(profile);
  const built = getMealSlots(profile.foodFlags).flatMap((slot) =>
    slot.variants.map((variant, index) =>
      Object.assign(
        buildMealWithItems(
          {
            id: slot.id,
            time: slot.time,
            mealType: slot.mealType,
            title: variant.title,
            calorieShare: slot.calorieShare,
            items: variant.items,
          },
          targets.calories,
        ),
        { isDefault: index === 0, slotId: slot.id },
      ),
    ),
  );

  return { profile, targets, built };
}

const scenarios = dietVariations.flatMap((diet) =>
  goalVariations.map((goal) => ({ name: `${diet.label}/${goal.label}`, diet, goal })),
);

describe("meal plan engine", () => {
  describe.each(scenarios)("$name", ({ diet, goal }) => {
    it("prices every planned meal from catalog ingredients", () => {
      for (const { meal, items } of buildScenario(diet, goal).built) {
        const result = verifyMeal(meal, items);
        expect(result.problems, `${meal.id} / ${meal.title}`).toEqual([]);
        expect(result.ok).toBe(true);
      }
    });

    it("never shows identical food with different macros", () => {
      const meals = buildScenario(diet, goal).built.map((entry) => entry.meal);
      expect(findInconsistentDuplicates(meals)).toEqual([]);
    });

    it("lists ingredients for every meal", () => {
      for (const { meal } of buildScenario(diet, goal).built) {
        expect(meal.quantity.trim(), `${meal.id} / ${meal.title}`).not.toBe("");
      }
    });

    it("adds up to roughly the daily calorie target", () => {
      const { targets, built } = buildScenario(diet, goal);
      const planCalories = built
        .filter((entry) => entry.isDefault)
        .reduce((total, entry) => total + entry.meal.calories, 0);

      expect(Math.abs(planCalories - targets.calories) / targets.calories).toBeLessThan(0.1);
    });

    it("keeps every alternative close to the slot it replaces", () => {
      const bySlot = new Map<string, number[]>();

      for (const entry of buildScenario(diet, goal).built) {
        bySlot.set(entry.slotId, [...(bySlot.get(entry.slotId) ?? []), entry.meal.calories]);
      }

      // Swapping a dish must not silently change the day's calorie budget.
      for (const [slotId, calories] of bySlot) {
        const min = Math.min(...calories);
        const max = Math.max(...calories);
        expect(max - min, `${slotId} variants drift: ${calories.join(", ")}`).toBeLessThan(
          Math.max(60, max * 0.15),
        );
      }
    });
  });

  it("detects macros that its ingredients do not support", () => {
    const lying = {
      id: "snack",
      quantity: "moong sprouts 100g",
      calories: 343,
      proteinG: 24,
    } as DietTimelineMeal;

    const result = verifyMeal(lying, [{ catalogId: "moong-sprouts", grams: 100 }]);

    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("protein shown 24");
  });

  it("detects ingredients the catalog cannot price", () => {
    const meal = { id: "x", quantity: "mystery", calories: 0, proteinG: 0 } as DietTimelineMeal;
    const result = verifyMeal(meal, [{ catalogId: "not-a-real-food", grams: 100 }]);

    expect(result.problems.join(" ")).toContain("unknown catalog item");
  });

  it("flags the original bug: same food, different numbers", () => {
    const text = "moong sprouts 100g, tomato 50g, lemon 10g";
    const morning = { id: "morning-snack", quantity: text, calories: 343, proteinG: 24 } as DietTimelineMeal;
    const bedtime = { id: "bedtime", quantity: text, calories: 156, proteinG: 7 } as DietTimelineMeal;

    expect(findInconsistentDuplicates([morning, bedtime])).toHaveLength(1);
  });

  // Correct macros are not enough — scaling a low-density dish to a calorie
  // budget once produced "moong sprouts 905g", which is arithmetically right and
  // useless. Every recipe must reach its slot's budget within the clamp, across
  // the whole range of daily targets the app produces.
  it.each([1400, 2000, 2400, 3000, 3400])(
    "reaches every slot budget with realistic portions at %i kcal/day",
    (dailyCalories) => {
      for (const flags of dietVariations) {
        for (const slot of getMealSlots(flags)) {
          for (const variant of slot.variants) {
            const base = getRecipeNutrition(variant.items).calories;
            const factor = (dailyCalories * slot.calorieShare) / base;

            expect(factor, `${slot.id}/"${variant.title}" needs ${factor.toFixed(2)}x`)
              .toBeGreaterThanOrEqual(MIN_RECIPE_SCALE);
            expect(factor, `${slot.id}/"${variant.title}" needs ${factor.toFixed(2)}x`)
              .toBeLessThanOrEqual(MAX_RECIPE_SCALE);
          }
        }
      }
    },
  );

  it("never lists an absurd portion of a single ingredient", () => {
    for (const diet of dietVariations) {
      for (const goal of goalVariations) {
        for (const { meal, items } of buildScenario(diet, goal).built) {
          for (const entry of items) {
            expect(entry.grams, `${meal.title}: ${entry.catalogId} ${entry.grams}g`).toBeLessThanOrEqual(500);
          }
        }
      }
    }
  });

  // An AI meal is only allowed through if it passes the same checks a
  // hand-written recipe does. These cover what a bad generation looks like.
  describe("AI suggestion gate", () => {
    const flags = { eatsMeat: false, eatsDairy: false, eatsEggs: false };
    const good = {
      title: "Sprout & chana bowl",
      items: [
        { catalogId: "moong-sprouts", grams: 150 },
        { catalogId: "roasted-chana", grams: 40 },
      ],
    };

    it("accepts a meal built from real foods that hits its budget", () => {
      const result = validateAiVariant(good, 200, flags);
      expect(result.ok).toBe(true);
    });

    it("rejects foods that are not in the catalog", () => {
      const result = validateAiVariant(
        { title: "Invented", items: [{ catalogId: "unicorn-steak", grams: 100 }] },
        200,
        flags,
      );

      expect(result).toMatchObject({ ok: false });
      expect(result.ok === false && result.reason).toContain("unknown food");
    });

    it("rejects portions no one would eat", () => {
      const result = validateAiVariant(
        { title: "Too much", items: [{ catalogId: "moong-sprouts", grams: 900 }] },
        200,
        flags,
      );

      expect(result).toMatchObject({ ok: false });
      expect(result.ok === false && result.reason).toContain("implausible portion");
    });

    it("rejects meals that miss the calorie budget by too much", () => {
      // A plain lemon cannot be stretched into a 600 kcal meal.
      const result = validateAiVariant(
        { title: "Just lemon", items: [{ catalogId: "lemon", grams: 10 }] },
        600,
        flags,
      );

      expect(result).toMatchObject({ ok: false });
      expect(result.ok === false && result.reason).toContain("scaling");
    });

    it("respects dietary preferences", () => {
      const meat = validateAiVariant(
        { title: "Chicken bowl", items: [{ catalogId: "grilled-chicken", grams: 150 }] },
        250,
        { eatsMeat: false, eatsDairy: true, eatsEggs: true },
      );
      expect(meat).toMatchObject({ ok: false });

      const dairy = validateAiVariant(
        { title: "Curd bowl", items: [{ catalogId: "curd", grams: 200 }] },
        100,
        { eatsMeat: true, eatsDairy: false, eatsEggs: true },
      );
      expect(dairy).toMatchObject({ ok: false });

      // Eggetarian: eggs pass the "meat"-tagged filter because eatsEggs is on.
      const eggetarianEgg = validateAiVariant(
        { title: "Egg toast", items: [{ catalogId: "eggs", grams: 100 }, { catalogId: "bread-toast", grams: 40 }] },
        250,
        { eatsMeat: false, eatsDairy: true, eatsEggs: true },
      );
      expect(eggetarianEgg).toMatchObject({ ok: true });

      // Vegetarian: eggs still rejected because eatsEggs is off.
      const vegetarianEgg = validateAiVariant(
        { title: "Egg toast", items: [{ catalogId: "eggs", grams: 100 }, { catalogId: "bread-toast", grams: 40 }] },
        250,
        { eatsMeat: false, eatsDairy: true, eatsEggs: false },
      );
      expect(vegetarianEgg).toMatchObject({ ok: false });
    });

    it("rejects an empty or oversized ingredient list", () => {
      expect(validateAiVariant({ title: "Nothing", items: [] }, 200, flags)).toMatchObject({
        ok: false,
      });

      const tooMany = Array.from({ length: 7 }, () => ({ catalogId: "moong-sprouts", grams: 20 }));
      expect(validateAiVariant({ title: "Too many", items: tooMany }, 200, flags)).toMatchObject({
        ok: false,
      });
    });
  });

  // Protein protection is only as good as what counts as protein. The staples
  // Indian meals get protein from are not lean isolates — dal is 22% protein by
  // calories and paneer 28% — so a stricter cut would treat them as carbs and
  // trim them, breaking the "protein kept where it was" promise.
  describe("protein anchor classification", () => {
    it.each(["dal", "paneer", "curd", "tofu", "soy-chunks", "eggs", "milk"])(
      "treats %s as a protein anchor",
      (catalogId) => {
        expect(isProteinAnchor({ catalogId, grams: 100 })).toBe(true);
      },
    );

    it.each(["rice", "roti", "raw-oats", "banana", "mixed-veg-sabzi", "dates"])(
      "does not treat %s as a protein anchor",
      (catalogId) => {
        expect(isProteinAnchor({ catalogId, grams: 100 })).toBe(false);
      },
    );

    it("trims a dal-and-paneer meal without taking protein down with it", () => {
      const thali = [
        { catalogId: "rice", grams: 180 },
        { catalogId: "dal", grams: 150 },
        { catalogId: "paneer", grams: 120 },
        { catalogId: "green-salad", grams: 100 },
      ];
      const before = getRecipeNutrition(thali);
      const after = getRecipeNutrition(
        scaleRecipeToCalories(thali, before.calories * 0.75, { protectProtein: true }),
      );

      // Calories come down...
      expect(after.calories).toBeLessThan(before.calories);
      // ...but the meal ends up more protein-dense than it started.
      const densityBefore = before.proteinG / before.calories;
      const densityAfter = after.proteinG / after.calories;
      expect(densityAfter).toBeGreaterThan(densityBefore);
    });
  });

  it("scales nutrition linearly with portion size", () => {
    const single = getRecipeNutrition([{ catalogId: "moong-sprouts", grams: 100 }]);
    const double = getRecipeNutrition([{ catalogId: "moong-sprouts", grams: 200 }]);

    expect(double.calories).toBeCloseTo(single.calories * 2, 5);
    expect(double.proteinG).toBeCloseTo(single.proteinG * 2, 5);
  });
});
