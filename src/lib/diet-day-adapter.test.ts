import { describe, expect, it } from "vitest";
import {
  adaptDayPlan,
  MAX_SLOT_BUDGET_RATIO,
  MIN_SLOT_BUDGET_RATIO,
  type AdaptableSlot,
} from "@/lib/diet-day-adapter";
import { buildMealWithItems } from "@/lib/meal-plan-engine";
import { getMealSlots } from "@/lib/meal-plan-recipes";

/**
 * The promise being tested: after a day goes off plan, the meals you have not
 * eaten yet are re-costed so the day still adds up — without rewriting history,
 * without proposing a punishing meal, and without quietly dropping protein.
 */

const DAILY_CALORIES = 2400;

function buildSlots(takenIds: string[] = []): AdaptableSlot[] {
  return getMealSlots({ eatsMeat: false, eatsDairy: true, eatsEggs: false }).map((slot) => {
    const { meal, items } = buildMealWithItems(
      {
        id: slot.id,
        time: slot.time,
        mealType: slot.mealType,
        title: slot.variants[0].title,
        calorieShare: slot.calorieShare,
        items: slot.variants[0].items,
      },
      DAILY_CALORIES,
    );

    return {
      id: slot.id,
      time: slot.time,
      calorieShare: slot.calorieShare,
      meal,
      items,
      taken: takenIds.includes(slot.id),
    };
  });
}

/** Calories a user would have eaten by taking these slots exactly as planned. */
function caloriesOf(slots: AdaptableSlot[], ids: string[]) {
  return slots
    .filter((slot) => ids.includes(slot.id))
    .reduce((total, slot) => total + slot.meal.calories, 0);
}

describe("diet day adapter", () => {
  it("leaves the plan alone when nothing has been eaten", () => {
    const result = adaptDayPlan({
      slots: buildSlots(),
      targetCalories: DAILY_CALORIES,
      consumedCalories: 0,
    });

    // Untouched plan already matches the target, so there is nothing to fix.
    expect(result.adapted).toBe(false);
    expect(result.slots.every((slot) => !slot.changed)).toBe(true);
  });

  it("leaves the plan alone when the day is on track", () => {
    const taken = ["breakfast"];
    const slots = buildSlots(taken);

    const result = adaptDayPlan({
      slots,
      targetCalories: DAILY_CALORIES,
      consumedCalories: caloriesOf(slots, taken),
    });

    expect(result.adapted).toBe(false);
  });

  it("ignores drift too small to be worth rewriting the plan over", () => {
    const taken = ["breakfast"];
    const slots = buildSlots(taken);

    const result = adaptDayPlan({
      slots,
      targetCalories: DAILY_CALORIES,
      consumedCalories: caloriesOf(slots, taken) + 40,
    });

    expect(result.adapted).toBe(false);
  });

  it("trims the remaining meals after an oversized lunch", () => {
    const taken = ["breakfast", "morning-snack", "lunch"];
    const slots = buildSlots(taken);
    const overshoot = 400;

    const result = adaptDayPlan({
      slots,
      targetCalories: DAILY_CALORIES,
      consumedCalories: caloriesOf(slots, taken) + overshoot,
    });

    expect(result.adapted).toBe(true);
    expect(result.headline).toContain("ahead of plan");

    for (const slot of result.slots) {
      if (taken.includes(slot.slotId)) {
        continue;
      }

      expect(slot.meal.calories).toBeLessThan(slot.original.calories);
    }
  });

  it("never rewrites a meal that already happened", () => {
    const taken = ["breakfast", "morning-snack", "lunch"];
    const slots = buildSlots(taken);

    const result = adaptDayPlan({
      slots,
      targetCalories: DAILY_CALORIES,
      consumedCalories: caloriesOf(slots, taken) + 500,
    });

    for (const slot of result.slots.filter((entry) => entry.taken)) {
      expect(slot.meal).toEqual(slot.original);
      expect(slot.changed).toBe(false);
      expect(slot.calorieDelta).toBe(0);
    }
  });

  it("keeps a floor under every remaining meal, however badly the day went", () => {
    const taken = ["breakfast", "morning-snack", "lunch"];
    const slots = buildSlots(taken);

    // Wildly over — the plan must still not propose a punishing dinner.
    const result = adaptDayPlan({
      slots,
      targetCalories: DAILY_CALORIES,
      consumedCalories: caloriesOf(slots, taken) + 2000,
    });

    for (const slot of result.slots.filter((entry) => !entry.taken)) {
      expect(slot.meal.calories).toBeGreaterThanOrEqual(
        Math.floor(slot.original.calories * MIN_SLOT_BUDGET_RATIO * 0.9),
      );
    }

    expect(result.cannotFullyAbsorb).toBe(true);
    expect(result.detail).toContain("tomorrow");
  });

  it("protects protein when it trims calories", () => {
    const taken = ["breakfast", "morning-snack", "lunch"];
    const slots = buildSlots(taken);

    const result = adaptDayPlan({
      slots,
      targetCalories: DAILY_CALORIES,
      consumedCalories: caloriesOf(slots, taken) + 500,
    });

    const dinner = result.slots.find((slot) => slot.slotId === "dinner");
    expect(dinner).toBeDefined();

    const calorieDrop = 1 - dinner!.meal.calories / dinner!.original.calories;
    const proteinDrop = 1 - dinner!.meal.proteinG / dinner!.original.proteinG;

    expect(calorieDrop).toBeGreaterThan(0);
    // Protein must fall by proportionally less than calories.
    expect(proteinDrop).toBeLessThan(calorieDrop);
  });

  it("tops meals up when the user is behind on calories", () => {
    const taken = ["breakfast", "morning-snack", "lunch"];
    const slots = buildSlots(taken);

    const result = adaptDayPlan({
      slots,
      targetCalories: DAILY_CALORIES,
      consumedCalories: caloriesOf(slots, taken) - 500,
    });

    expect(result.adapted).toBe(true);
    expect(result.headline).toContain("still to eat");

    const grew = result.slots.filter(
      (slot) => !slot.taken && slot.meal.calories > slot.original.calories,
    );
    expect(grew.length).toBeGreaterThan(0);
  });

  it("caps how large a remaining meal can grow", () => {
    const taken = ["breakfast"];
    const slots = buildSlots(taken);

    // Barely ate anything — later meals must not become a feast.
    const result = adaptDayPlan({
      slots,
      targetCalories: DAILY_CALORIES,
      consumedCalories: 50,
    });

    for (const slot of result.slots.filter((entry) => !entry.taken)) {
      expect(slot.meal.calories).toBeLessThanOrEqual(
        Math.ceil(slot.original.calories * MAX_SLOT_BUDGET_RATIO * 1.1),
      );
    }
  });

  it("does nothing once every meal has been taken", () => {
    const allIds = buildSlots().map((slot) => slot.id);
    const slots = buildSlots(allIds);

    const result = adaptDayPlan({
      slots,
      targetCalories: DAILY_CALORIES,
      consumedCalories: caloriesOf(slots, allIds) + 600,
    });

    expect(result.adapted).toBe(false);
    expect(result.slots.every((slot) => !slot.changed)).toBe(true);
  });

  it("still lists real ingredients for every adapted meal", () => {
    const taken = ["breakfast", "morning-snack"];
    const slots = buildSlots(taken);

    const result = adaptDayPlan({
      slots,
      targetCalories: DAILY_CALORIES,
      consumedCalories: caloriesOf(slots, taken) + 350,
    });

    for (const slot of result.slots) {
      expect(slot.meal.quantity.trim()).not.toBe("");
      expect(slot.meal.calories).toBeGreaterThan(0);
    }
  });
});
