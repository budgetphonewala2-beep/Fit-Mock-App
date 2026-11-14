import { getOpenAiMealModel } from "@/lib/env";
import {
  getPlanFood,
  getRecipeNutrition,
  MAX_RECIPE_SCALE,
  MIN_RECIPE_SCALE,
  type MealRecipeItem,
} from "@/lib/meal-plan-engine";
import { foodCatalog } from "@/lib/nutrition-dataset";
import type { DietFlags, MealVariant } from "@/lib/meal-plan-recipes";
import type { MealType } from "@/lib/types";

/**
 * AI-generated meal variety, on top of the deterministic engine.
 *
 * The model only ever chooses catalog ids and gram amounts — it never supplies
 * calories or protein. Those are computed from the catalog afterwards, so an
 * AI suggestion is priced by exactly the same code as a hand-written recipe and
 * inherits the same guarantee: the numbers always describe the food listed.
 *
 * Anything the model returns that fails validateAiVariant is discarded rather
 * than shown, so a bad generation degrades to the curated variants instead of
 * putting an untrustworthy number in front of a user.
 */

/** Foods the planner may build from — small, clean subset of the full catalog. */
// The catalog tags eggs as "meat", so eatsMeat alone can't distinguish
// eggetarians from vegetarians — check the id explicitly for that split.
function isEgg(food: { id: string }) {
  return food.id === "eggs";
}

function getSelectableFoods(flags: DietFlags) {
  return foodCatalog.filter((food) => {
    const tags = food.tags ?? [];

    if (isEgg(food)) {
      return flags.eatsEggs;
    }

    if (!flags.eatsMeat && tags.includes("meat")) {
      return false;
    }

    if (!flags.eatsDairy && tags.includes("dairy")) {
      return false;
    }

    // Whole ingredients scale predictably; composite restaurant dishes do not.
    return food.source === "dietfit-curated" || food.source === "dataset-import";
  });
}

export type AiVariantRejection = { ok: false; reason: string };
export type AiVariantAccepted = { ok: true; variant: MealVariant };

export function validateAiVariant(
  candidate: { title: string; items: MealRecipeItem[] },
  targetCalories: number,
  flags: DietFlags,
): AiVariantAccepted | AiVariantRejection {
  if (!candidate.title.trim()) {
    return { ok: false, reason: "missing title" };
  }

  if (candidate.items.length === 0 || candidate.items.length > 6) {
    return { ok: false, reason: `unusable ingredient count (${candidate.items.length})` };
  }

  for (const item of candidate.items) {
    const food = getPlanFood(item.catalogId);

    if (!food) {
      return { ok: false, reason: `unknown food "${item.catalogId}"` };
    }

    if (!Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 500) {
      return { ok: false, reason: `implausible portion ${item.grams}g of ${item.catalogId}` };
    }

    const tags = food.tags ?? [];

    if (isEgg(food)) {
      if (!flags.eatsEggs) {
        return { ok: false, reason: `${food.name} breaks the no-eggs preference` };
      }
    } else if (!flags.eatsMeat && tags.includes("meat")) {
      return { ok: false, reason: `${food.name} breaks the no-meat preference` };
    }

    if (!flags.eatsDairy && tags.includes("dairy")) {
      return { ok: false, reason: `${food.name} breaks the no-dairy preference` };
    }
  }

  // Must be able to reach the slot's budget without absurd scaling.
  const baseCalories = getRecipeNutrition(candidate.items).calories;

  if (baseCalories <= 0) {
    return { ok: false, reason: "recipe has no calories" };
  }

  const factor = targetCalories / baseCalories;

  if (factor < MIN_RECIPE_SCALE || factor > MAX_RECIPE_SCALE) {
    return {
      ok: false,
      reason: `needs ${factor.toFixed(2)}x scaling to reach ${Math.round(targetCalories)} kcal`,
    };
  }

  return { ok: true, variant: { title: candidate.title.trim(), items: candidate.items } };
}

type AiMealResponse = { title: string; items: { catalogId: string; grams: number }[] };

function parseAiMeal(value: unknown): AiMealResponse | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.title !== "string" || !Array.isArray(record.items)) {
    return null;
  }

  const items: { catalogId: string; grams: number }[] = [];

  for (const entry of record.items) {
    if (typeof entry !== "object" || entry === null) {
      return null;
    }

    const itemRecord = entry as Record<string, unknown>;

    if (typeof itemRecord.catalogId !== "string" || typeof itemRecord.grams !== "number") {
      return null;
    }

    items.push({ catalogId: itemRecord.catalogId, grams: itemRecord.grams });
  }

  return { title: record.title, items };
}

function getOutputText(responseJson: unknown): string | null {
  if (
    typeof responseJson === "object" &&
    responseJson !== null &&
    "output_text" in responseJson &&
    typeof (responseJson as { output_text: unknown }).output_text === "string"
  ) {
    return (responseJson as { output_text: string }).output_text;
  }

  if (
    typeof responseJson !== "object" ||
    responseJson === null ||
    !("output" in responseJson) ||
    !Array.isArray((responseJson as { output: unknown }).output)
  ) {
    return null;
  }

  for (const outputItem of (responseJson as { output: unknown[] }).output) {
    if (typeof outputItem !== "object" || outputItem === null || !("content" in outputItem)) {
      continue;
    }

    const content = (outputItem as { content: unknown }).content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (
        typeof contentItem === "object" &&
        contentItem !== null &&
        "type" in contentItem &&
        (contentItem as { type: unknown }).type === "output_text" &&
        typeof (contentItem as { text: unknown }).text === "string"
      ) {
        return (contentItem as { text: string }).text;
      }
    }
  }

  return null;
}

export async function generateMealVariantWithAi(args: {
  mealType: MealType;
  targetCalories: number;
  flags: DietFlags;
  avoidTitles: string[];
}): Promise<MealVariant> {
  const selectable = getSelectableFoods(args.flags);
  const selectableIds = selectable.map((food) => food.id);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAiMealModel(),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You compose a single meal for a nutrition app from a fixed food catalog. " +
                "Return only catalog ids and gram amounts — never calories or macros, the app " +
                "computes those from the catalog. Pick 2-5 foods that genuinely go together as " +
                "one dish, use realistic home portions, and make the meal land close to the " +
                "requested calorie target. Give it a short natural name like 'Paneer rice bowl'.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Meal type: ${args.mealType}\n` +
                `Target calories: ${Math.round(args.targetCalories)}\n` +
                `Avoid these dishes: ${args.avoidTitles.join(", ") || "none"}\n` +
                `Catalog: ${JSON.stringify(
                  selectable.map((food) => ({
                    id: food.id,
                    name: food.name,
                    kcalPer100g: Math.round(food.nutritionPer100g.calories),
                    proteinPer100g: Math.round(food.nutritionPer100g.proteinG),
                  })),
                )}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meal_plan_variant",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    catalogId: { type: "string", enum: selectableIds },
                    grams: { type: "number", exclusiveMinimum: 0 },
                  },
                  required: ["catalogId", "grams"],
                },
              },
            },
            required: ["title", "items"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI meal variant request failed with status ${response.status}.`);
  }

  const outputText = getOutputText(await response.json());

  if (!outputText) {
    throw new Error("OpenAI meal variant returned no structured output.");
  }

  const candidate = parseAiMeal(JSON.parse(outputText));

  if (!candidate) {
    throw new Error("OpenAI meal variant returned an unexpected shape.");
  }

  // The gate: an AI meal is only usable if it survives the same checks a
  // hand-written recipe must pass.
  const validated = validateAiVariant(candidate, args.targetCalories, args.flags);

  if (!validated.ok) {
    throw new Error(`Rejected AI meal variant: ${validated.reason}`);
  }

  return validated.variant;
}
