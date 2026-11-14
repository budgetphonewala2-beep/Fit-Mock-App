// Imports the catalog directly (a leaf module) rather than going through
// meal-catalog/recommendations, so the planner can depend on this engine
// without creating an import cycle. Macro math is done at full precision here;
// rounding happens once, at display time.
import { foodCatalog } from "@/lib/nutrition-dataset";
import type { DietTimelineMeal, MealType, NutritionSummary } from "@/lib/types";

/**
 * Meal-plan engine.
 *
 * The invariant this module exists to enforce:
 *
 *   A meal's macros are ALWAYS computed from the actual foods and portions it
 *   is made of. They are never assigned independently of the food.
 *
 * Previously a planned meal's macros were a fixed ratio of the daily target
 * (e.g. "this slot is 11% of your calories") while the food text was a separate
 * hard-coded string. The two could not disagree, because they were never
 * related — which let the exact same food render as 24g protein in one slot and
 * 7g in another. Deriving both the text and the macros from one list of
 * catalog-priced ingredients makes that class of bug structurally impossible.
 */

export type MealRecipeItem = {
  catalogId: string;
  grams: number;
};

export type MealRecipe = {
  id: string;
  time: string;
  mealType: MealType;
  title: string;
  /** Share of the day's calories this slot should carry. */
  calorieShare: number;
  items: MealRecipeItem[];
};

/** Units that read naturally as a count ("2 roti") rather than a weight. */
const DISCRETE_UNITS = new Set([
  "date",
  "slice",
  "roti",
  "egg",
  "banana",
  "idli",
  "dosa",
  "chilla",
  "piece",
]);

const LIQUID_UNITS = new Set(["milliliter", "liter", "glass"]);

export function getPlanFood(catalogId: string) {
  return foodCatalog.find((food) => food.id === catalogId) ?? null;
}

function getPrimaryPortion(catalogId: string) {
  return getPlanFood(catalogId)?.portions[0] ?? null;
}

/** Human-readable portion text for one ingredient, derived from its grams. */
export function formatRecipeItem(item: MealRecipeItem) {
  const food = getPlanFood(item.catalogId);

  if (!food) {
    return "";
  }

  const name = food.name.toLowerCase();
  const portion = getPrimaryPortion(item.catalogId);
  const unit = portion ? portion.unit : "";

  if (portion && DISCRETE_UNITS.has(unit)) {
    const count = Math.max(1, Math.round(item.grams / portion.grams));
    return `${name} ${count}`;
  }

  if (portion && LIQUID_UNITS.has(unit)) {
    return `${name} ${Math.round(item.grams)}ml`;
  }

  return `${name} ${Math.round(item.grams)}g`;
}

/** The single source of truth: nutrition computed from catalog-priced grams. */
export function getRecipeNutrition(items: MealRecipeItem[]): NutritionSummary {
  const total: NutritionSummary = {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatsG: 0,
    fiberG: 0,
    micros: { calcium: 0, iron: 0, fiber: 0, vitaminB12: 0 },
  };

  for (const item of items) {
    const food = getPlanFood(item.catalogId);

    if (!food) {
      continue;
    }

    const per100 = food.nutritionPer100g;
    const factor = item.grams / 100;

    total.calories += per100.calories * factor;
    total.proteinG += per100.proteinG * factor;
    total.carbsG += per100.carbsG * factor;
    total.fatsG += per100.fatsG * factor;
    total.fiberG += per100.fiberG * factor;

    for (const [key, value] of Object.entries(per100.micros)) {
      total.micros[key] = (total.micros[key] ?? 0) + value * factor;
    }
  }

  return total;
}

/**
 * Scale a recipe's portions so the meal lands on its calorie budget, then read
 * the macros back off the scaled ingredients. Calories drive the scaling and
 * every other macro follows from the food, so the numbers stay honest even when
 * they don't perfectly match a macro split.
 */
/**
 * How far a recipe may be stretched or shrunk. Without this a low-density dish
 * gets scaled into something nobody would eat — a sprout salad "scaled" to a
 * 343 kcal snack becomes 905g of sprouts. Correct arithmetic, useless advice.
 * Recipes are expected to be composed near their slot's budget; the clamp is the
 * backstop, and meal-plan-engine.test.ts fails if any recipe leans on it.
 */
export const MIN_RECIPE_SCALE = 0.4;
export const MAX_RECIPE_SCALE = 2.5;

/**
 * An ingredient counts as a protein anchor when protein carries a real share of
 * its calories — dal, paneer, curd, tofu, soy chunks, eggs, milk.
 *
 * The threshold is 20%, not something higher, because the staples people
 * actually eat protein from are not lean isolates: dal is 22% protein by
 * calories and paneer 28%, while rice (8%), roti (11%) and oats (14%) sit well
 * below. A stricter cut would classify dal and paneer as carbs and quietly trim
 * them, which is exactly what the "protein kept where it was" promise rules out.
 */
const PROTEIN_ANCHOR_THRESHOLD = 0.2;

export function isProteinAnchor(item: MealRecipeItem) {
  const food = getPlanFood(item.catalogId);

  if (!food || food.nutritionPer100g.calories <= 0) {
    return false;
  }

  return (
    (food.nutritionPer100g.proteinG * 4) / food.nutritionPer100g.calories >=
    PROTEIN_ANCHOR_THRESHOLD
  );
}

export function scaleRecipeToCalories(
  items: MealRecipeItem[],
  targetCalories: number,
  options: { protectProtein?: boolean } = {},
): MealRecipeItem[] {
  const baseCalories = getRecipeNutrition(items).calories;

  if (baseCalories <= 0 || targetCalories <= 0) {
    return items;
  }

  const factor = Math.min(
    MAX_RECIPE_SCALE,
    Math.max(MIN_RECIPE_SCALE, targetCalories / baseCalories),
  );

  // When trimming a meal we would rather cut rice than cut dal, so protein
  // anchors absorb only part of the reduction and the rest is taken from the
  // carb/fat ingredients. Calories still land on target; the protein survives.
  const factorByItem = new Map<MealRecipeItem, number>();

  if (options.protectProtein && factor < 1) {
    const anchorCalories = items
      .filter(isProteinAnchor)
      .reduce((total, item) => total + getRecipeNutrition([item]).calories, 0);
    const otherCalories = baseCalories - anchorCalories;

    if (anchorCalories > 0 && otherCalories > 0) {
      // Anchors take 40% of the cut a uniform scale would have applied.
      const anchorFactor = factor + (1 - factor) * 0.6;
      const otherFactor = (targetCalories - anchorCalories * anchorFactor) / otherCalories;

      if (otherFactor >= MIN_RECIPE_SCALE) {
        for (const item of items) {
          factorByItem.set(item, isProteinAnchor(item) ? anchorFactor : otherFactor);
        }
      }
    }
  }

  return items.map((item) => {
    const portion = getPrimaryPortion(item.catalogId);
    const scaled = item.grams * (factorByItem.get(item) ?? factor);

    // Discrete foods can only move in whole units, so round to the portion.
    if (portion && DISCRETE_UNITS.has(portion.unit)) {
      const count = Math.max(1, Math.round(scaled / portion.grams));
      return { ...item, grams: count * portion.grams };
    }

    return { ...item, grams: Math.max(5, Math.round(scaled / 5) * 5) };
  });
}

export function buildMealFromRecipe(
  recipe: MealRecipe,
  dailyCalories: number,
): DietTimelineMeal {
  return buildMealWithItems(recipe, dailyCalories).meal;
}

/** Same as buildMealFromRecipe but also returns the scaled ingredients, so
 *  verification can re-derive the macros and prove they match. */
export function buildMealWithItems(
  recipe: MealRecipe,
  dailyCalories: number,
): { meal: DietTimelineMeal; items: MealRecipeItem[] } {
  const items = scaleRecipeToCalories(recipe.items, dailyCalories * recipe.calorieShare);
  const nutrition = getRecipeNutrition(items);

  const meal: DietTimelineMeal = {
    id: recipe.id,
    time: recipe.time,
    title: recipe.title,
    mealType: recipe.mealType,
    quantity: items.map(formatRecipeItem).filter(Boolean).join(", "),
    purpose: "",
    calories: Math.round(nutrition.calories),
    proteinG: Math.round(nutrition.proteinG),
    carbsG: Math.round(nutrition.carbsG),
    fatsG: Math.round(nutrition.fatsG),
  };

  return { meal, items };
}

/* ── Verification ───────────────────────────────────────────────────────────
 * Guards exercised by meal-plan-engine.test.ts. These are what stop the class of
 * bug from coming back: any meal whose ingredients are unknown to the catalog,
 * or whose macros drift from its own ingredients, is a hard failure.
 */

export type MealVerification = {
  mealId: string;
  ok: boolean;
  problems: string[];
};

export function verifyMeal(meal: DietTimelineMeal, items: MealRecipeItem[]): MealVerification {
  const problems: string[] = [];

  for (const item of items) {
    if (!getPlanFood(item.catalogId)) {
      problems.push(`unknown catalog item "${item.catalogId}"`);
    }
  }

  const truth = getRecipeNutrition(items);
  const checks: [string, number, number][] = [
    ["calories", meal.calories, truth.calories],
    ["protein", meal.proteinG, truth.proteinG],
    ["carbs", meal.carbsG, truth.carbsG],
    ["fats", meal.fatsG, truth.fatsG],
  ];

  for (const [label, shown, actual] of checks) {
    // Only rounding should ever separate the two.
    if (Math.abs(shown - actual) > 1) {
      problems.push(`${label} shown ${Math.round(shown)} vs food ${Math.round(actual)}`);
    }
  }

  return { mealId: meal.id, ok: problems.length === 0, problems };
}

/**
 * The specific regression that triggered this engine: the same ingredients
 * shown with different macros in different slots.
 */
export function findInconsistentDuplicates(meals: DietTimelineMeal[]) {
  const byQuantity = new Map<string, DietTimelineMeal[]>();

  for (const meal of meals) {
    const key = meal.quantity.trim().toLowerCase();
    byQuantity.set(key, [...(byQuantity.get(key) ?? []), meal]);
  }

  return Array.from(byQuantity.entries())
    .filter(([, group]) => group.length > 1)
    .filter(([, group]) =>
      group.some(
        (meal) =>
          meal.calories !== group[0].calories ||
          meal.proteinG !== group[0].proteinG ||
          meal.carbsG !== group[0].carbsG ||
          meal.fatsG !== group[0].fatsG,
      ),
    )
    .map(([quantity, group]) => ({ quantity, meals: group }));
}
