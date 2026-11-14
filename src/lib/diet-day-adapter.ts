import {
  formatRecipeItem,
  getRecipeNutrition,
  scaleRecipeToCalories,
  type MealRecipeItem,
} from "@/lib/meal-plan-engine";
import type { DietTimelineMeal } from "@/lib/types";

/**
 * Keeps today's plan honest after real life happens.
 *
 * A static plan is right at breakfast and wrong by lunch: eat 250 kcal more
 * than planned and every later meal silently becomes fiction, which is the
 * usual reason people abandon a plan altogether. This re-costs the meals you
 * have *not* eaten yet so the day still adds up.
 *
 * Design rules, in priority order:
 *   1. Never rewrite a meal that already happened.
 *   2. Never propose a punishing meal — every remaining meal keeps a floor.
 *   3. Protect protein. Calories flex; the protein anchor does not.
 *   4. Today only. A surplus never silently compounds into tomorrow.
 */

/** A remaining meal keeps at least this much of its original budget... */
export const MIN_SLOT_BUDGET_RATIO = 0.65;
/** ...and never balloons past this, so one skipped meal can't create a feast. */
export const MAX_SLOT_BUDGET_RATIO = 1.5;

export type AdaptableSlot = {
  id: string;
  time: string;
  calorieShare: number;
  /** The option currently shown for this slot. */
  meal: DietTimelineMeal;
  items: MealRecipeItem[];
  /** True once the user has marked this meal taken. */
  taken: boolean;
};

export type AdaptedSlot = {
  slotId: string;
  original: DietTimelineMeal;
  meal: DietTimelineMeal;
  taken: boolean;
  changed: boolean;
  calorieDelta: number;
  proteinDelta: number;
};

export type DayAdaptation = {
  adapted: boolean;
  slots: AdaptedSlot[];
  consumedCalories: number;
  /** Positive when the day is already over target. */
  overBy: number;
  /** Calories still available across the untaken meals. */
  remainingCalories: number;
  /** True when the overshoot is too large for the remaining meals to absorb. */
  cannotFullyAbsorb: boolean;
  headline: string | null;
  detail: string | null;
};

function rebuildMeal(
  slot: AdaptableSlot,
  budgetCalories: number,
): { meal: DietTimelineMeal; items: MealRecipeItem[] } {
  const items = scaleRecipeToCalories(slot.items, budgetCalories, { protectProtein: true });
  const nutrition = getRecipeNutrition(items);

  return {
    items,
    meal: {
      ...slot.meal,
      quantity: items.map(formatRecipeItem).filter(Boolean).join(", "),
      calories: Math.round(nutrition.calories),
      proteinG: Math.round(nutrition.proteinG),
      carbsG: Math.round(nutrition.carbsG),
      fatsG: Math.round(nutrition.fatsG),
    },
  };
}

export function adaptDayPlan(args: {
  slots: AdaptableSlot[];
  targetCalories: number;
  /** Everything actually logged today, planned or not. */
  consumedCalories: number;
}): DayAdaptation {
  const { slots, targetCalories, consumedCalories } = args;
  const remainingSlots = slots.filter((slot) => !slot.taken);

  const unchanged = (headline: string | null = null, detail: string | null = null) => ({
    adapted: false,
    slots: slots.map((slot) => ({
      slotId: slot.id,
      original: slot.meal,
      meal: slot.meal,
      taken: slot.taken,
      changed: false,
      calorieDelta: 0,
      proteinDelta: 0,
    })),
    consumedCalories,
    overBy: Math.max(0, consumedCalories - targetCalories),
    remainingCalories: Math.max(0, targetCalories - consumedCalories),
    cannotFullyAbsorb: false,
    headline,
    detail,
  });

  if (remainingSlots.length === 0 || targetCalories <= 0) {
    return unchanged();
  }

  // Deviation is measured against the plan, not against the raw calorie target.
  // Portion rounding means a freshly built day never sums to exactly the target,
  // and comparing to the target would make an untouched plan look off by that
  // residue and "adapt" itself on load.
  const plannedRemaining = remainingSlots.reduce((total, slot) => total + slot.meal.calories, 0);
  const plannedForTaken = slots
    .filter((slot) => slot.taken)
    .reduce((total, slot) => total + slot.meal.calories, 0);
  // Positive when more has been eaten than the taken meals called for — which
  // also covers anything logged off-plan, since nothing accounted for it.
  const deviation = consumedCalories - plannedForTaken;
  const budgetRemaining = Math.max(0, plannedRemaining - deviation);

  // Small drift is noise — rewriting the plan over 40 kcal is just twitchy.
  if (Math.abs(deviation) < 60) {
    return unchanged();
  }

  const shareTotal = remainingSlots.reduce((total, slot) => total + slot.calorieShare, 0);
  let allocated = 0;
  const rebuiltBySlot = new Map<string, DietTimelineMeal>();

  for (const slot of remainingSlots) {
    const originalBudget = slot.meal.calories;
    const share = shareTotal > 0 ? slot.calorieShare / shareTotal : 1 / remainingSlots.length;
    const rawBudget = Math.max(0, budgetRemaining) * share;
    const budget = Math.min(
      originalBudget * MAX_SLOT_BUDGET_RATIO,
      Math.max(originalBudget * MIN_SLOT_BUDGET_RATIO, rawBudget),
    );

    const { meal } = rebuildMeal(slot, budget);
    rebuiltBySlot.set(slot.id, meal);
    allocated += meal.calories;
  }

  const adaptedSlots: AdaptedSlot[] = slots.map((slot) => {
    const rebuilt = rebuiltBySlot.get(slot.id);

    if (!rebuilt || slot.taken) {
      return {
        slotId: slot.id,
        original: slot.meal,
        meal: slot.meal,
        taken: slot.taken,
        changed: false,
        calorieDelta: 0,
        proteinDelta: 0,
      };
    }

    return {
      slotId: slot.id,
      original: slot.meal,
      meal: rebuilt,
      taken: slot.taken,
      changed: rebuilt.calories !== slot.meal.calories,
      calorieDelta: rebuilt.calories - slot.meal.calories,
      proteinDelta: rebuilt.proteinG - slot.meal.proteinG,
    };
  });

  const changedCount = adaptedSlots.filter((slot) => slot.changed).length;

  if (changedCount === 0) {
    return unchanged();
  }

  const overBy = Math.max(0, consumedCalories - targetCalories);
  // Floors mean a big overshoot can't be fully absorbed — say so instead of
  // proposing meals nobody should eat.
  const cannotFullyAbsorb = allocated > budgetRemaining + 60;

  const gap = Math.round(Math.abs(deviation));
  const headline =
    deviation > 0
      ? `Adjusted · you're ${gap} kcal ahead of plan`
      : `Adjusted · ${gap} kcal still to eat`;

  const detail = cannotFullyAbsorb
    ? "Today's remaining meals are already at their minimum. Finish these and pick it up tomorrow."
    : deviation > 0
      ? "Remaining meals trimmed on carbs, protein kept where it was."
      : "Remaining meals topped up so you still hit your target.";

  return {
    adapted: true,
    slots: adaptedSlots,
    consumedCalories,
    overBy,
    remainingCalories: Math.max(0, budgetRemaining),
    cannotFullyAbsorb,
    headline,
    detail,
  };
}
