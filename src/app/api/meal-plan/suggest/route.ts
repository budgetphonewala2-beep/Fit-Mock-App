import { NextResponse } from "next/server";
import { hasOpenAiMealEnv } from "@/lib/env";
import { generateMealVariantWithAi } from "@/lib/meal-plan-ai";
import { buildMealWithItems, verifyMeal } from "@/lib/meal-plan-engine";
import type { MealType } from "@/lib/types";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/**
 * Suggests one extra meal option for a plan slot.
 *
 * The AI only picks foods and portions; this route prices them with the same
 * engine the built-in plan uses and re-verifies the result before returning it.
 * If anything fails, it 422s and the client falls back to curated variants —
 * we would rather offer less variety than show a number we cannot stand behind.
 */
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = body as {
    slotId?: unknown;
    time?: unknown;
    mealType?: unknown;
    calorieShare?: unknown;
    dailyCalories?: unknown;
    eatsMeat?: unknown;
    eatsDairy?: unknown;
    eatsEggs?: unknown;
    avoidTitles?: unknown;
  };

  if (
    typeof input.slotId !== "string" ||
    typeof input.time !== "string" ||
    typeof input.mealType !== "string" ||
    !MEAL_TYPES.includes(input.mealType as MealType) ||
    typeof input.calorieShare !== "number" ||
    input.calorieShare <= 0 ||
    input.calorieShare > 1 ||
    typeof input.dailyCalories !== "number" ||
    input.dailyCalories <= 0 ||
    typeof input.eatsMeat !== "boolean" ||
    typeof input.eatsDairy !== "boolean"
  ) {
    return NextResponse.json({ error: "Invalid meal suggestion request." }, { status: 400 });
  }

  if (!hasOpenAiMealEnv()) {
    return NextResponse.json({ error: "AI suggestions are not configured." }, { status: 503 });
  }

  // Older clients don't send eatsEggs; default it from eatsMeat since anyone
  // eating meat also eats eggs, and pure vegetarians shouldn't be flipped on.
  const flags = {
    eatsMeat: input.eatsMeat,
    eatsDairy: input.eatsDairy,
    eatsEggs: typeof input.eatsEggs === "boolean" ? input.eatsEggs : input.eatsMeat,
  };
  const avoidTitles = Array.isArray(input.avoidTitles)
    ? input.avoidTitles.filter((title): title is string => typeof title === "string")
    : [];

  try {
    const variant = await generateMealVariantWithAi({
      mealType: input.mealType as MealType,
      targetCalories: input.dailyCalories * input.calorieShare,
      flags,
      avoidTitles,
    });

    const { meal, items } = buildMealWithItems(
      {
        id: input.slotId,
        time: input.time,
        mealType: input.mealType as MealType,
        title: variant.title,
        calorieShare: input.calorieShare,
        items: variant.items,
      },
      input.dailyCalories,
    );

    // Final gate — the returned meal must describe its own ingredients.
    const verification = verifyMeal(meal, items);

    if (!verification.ok) {
      console.error("AI meal variant failed verification.", verification.problems);
      return NextResponse.json({ error: "Could not verify the suggested meal." }, { status: 422 });
    }

    // Items travel with the meal so the day adapter can re-cost this option
    // later without re-inventing its nutrition.
    return NextResponse.json({ meal, items, source: "ai-verified" });
  } catch (error) {
    console.error("AI meal variant generation failed.", error);
    return NextResponse.json({ error: "Could not suggest a meal right now." }, { status: 422 });
  }
}
