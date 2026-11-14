import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetMealEstimateCacheForTests,
  buildMealParseResultFromAiSelection,
} from "@/lib/meal-ai";

function estimated(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Ragi porridge",
    quantity: 1,
    unit: "bowl",
    calories: 220,
    proteinG: 6,
    carbsG: 42,
    fatsG: 3,
    fiberG: 5,
    confidence: 0.8,
    ...overrides,
  } as {
    name: string;
    quantity: number;
    unit: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatsG: number;
    fiberG: number;
    confidence: number;
  };
}

describe("buildMealParseResultFromAiSelection", () => {
  beforeEach(() => {
    __resetMealEstimateCacheForTests();
  });

  it("logs a dish outside the catalog with the model's nutrition estimate", () => {
    const result = buildMealParseResultFromAiSelection(
      { items: [], estimatedItems: [estimated()], unmatchedItems: [] },
      "breakfast",
    );

    expect(result.parsedItems).toHaveLength(1);
    // Calories are reconciled from macros via Atwater (4P + 4C + 9F = 219),
    // not the model's 220, so the displayed breakdown is self-consistent.
    expect(result.parsedItems[0]).toMatchObject({
      name: "Ragi porridge",
      quantity: 1,
      unit: "bowl",
      nutrition: { calories: 219, proteinG: 6, carbsG: 42, fatsG: 3, fiberG: 5 },
    });
    expect(result.estimatedNutrition.calories).toBe(219);
    expect(result.unrecognizedSegments).toEqual([]);
  });

  it("keeps estimates in the low-confidence band so the sheet flags them", () => {
    const result = buildMealParseResultFromAiSelection(
      { items: [], estimatedItems: [estimated({ confidence: 0.95 })], unmatchedItems: [] },
      "breakfast",
    );

    expect(result.parsedItems[0].confidence).toBeLessThan(0.6);
  });

  it("adds estimates to catalog matches in the totals", () => {
    const result = buildMealParseResultFromAiSelection(
      {
        items: [
          { catalogId: "roti", quantity: 2, unit: "roti", matchedText: "2 roti", confidence: 0.9 },
        ],
        estimatedItems: [estimated()],
        unmatchedItems: [],
      },
      "lunch",
    );

    expect(result.parsedItems.map((item) => item.name)).toContain("Ragi porridge");
    expect(result.parsedItems).toHaveLength(2);
    expect(result.estimatedNutrition.calories).toBeGreaterThan(220);
  });

  it("clamps impossible numbers instead of logging them", () => {
    // Negative protein is clamped to 0, and calories are then recomputed from
    // the clamped macros via Atwater (4*0 + 4*42 + 9*3 = 195), so the model's
    // fantasy 99999 kcal never reaches the user.
    const result = buildMealParseResultFromAiSelection(
      {
        items: [],
        estimatedItems: [estimated({ calories: 99999, proteinG: -4 })],
        unmatchedItems: [],
      },
      "dinner",
    );

    expect(result.parsedItems[0].nutrition.proteinG).toBe(0);
    expect(result.parsedItems[0].nutrition.calories).toBe(195);
  });

  it("moves a nameless or zero-portion estimate out of the logged items", () => {
    const result = buildMealParseResultFromAiSelection(
      {
        items: [],
        estimatedItems: [estimated({ name: "  " }), estimated({ name: "Poha", quantity: 0 })],
        unmatchedItems: [],
      },
      "breakfast",
    );

    expect(result.parsedItems).toEqual([]);
    expect(result.unrecognizedSegments).toEqual(["Poha"]);
  });

  it("reuses the first estimate for the same dish on later calls", () => {
    buildMealParseResultFromAiSelection(
      { items: [], estimatedItems: [estimated({ name: "Pyaz paratha", unit: "paratha" })], unmatchedItems: [] },
      "breakfast",
    );

    const second = buildMealParseResultFromAiSelection(
      {
        items: [],
        estimatedItems: [
          estimated({
            name: "Pyaz paratha",
            unit: "paratha",
            quantity: 3,
            calories: 999,
            proteinG: 42,
            carbsG: 120,
            fatsG: 30,
            fiberG: 12,
          }),
        ],
        unmatchedItems: [],
      },
      "lunch",
    );

    // First call cached per-paratha macros (6 P / 42 C / 3 F). Second call for
    // 3 paratha scales the macros to 18 P / 126 C / 9 F, and calories are
    // recomputed from those via Atwater (4*18 + 4*126 + 9*9 = 657) rather than
    // the model's drifted 999 or the cached 660.
    expect(second.parsedItems[0].nutrition.calories).toBe(657);
    expect(second.parsedItems[0].nutrition.proteinG).toBe(18);
  });

  it("folds spelling variants onto the same cache entry", () => {
    buildMealParseResultFromAiSelection(
      { items: [], estimatedItems: [estimated({ name: "Pyaaz paratha", unit: "paratha" })], unmatchedItems: [] },
      "breakfast",
    );

    const second = buildMealParseResultFromAiSelection(
      {
        items: [],
        estimatedItems: [
          estimated({
            name: "Pyaz paratha",
            unit: "paratha",
            quantity: 2,
            calories: 888,
          }),
        ],
        unmatchedItems: [],
      },
      "lunch",
    );

    // Pyaaz → Pyaz after collapsing repeat vowels: same cache slot. 2 paratha
    // scales cached per-unit macros (6 P / 42 C / 3 F) to 12 / 84 / 6, which
    // Atwater reconciles to 4*12 + 4*84 + 9*6 = 438.
    expect(second.parsedItems[0].nutrition.calories).toBe(438);
  });

  it("recomputes calories from macros when the model's kcal disagrees", () => {
    // Fitness users describe protein supplements by the grams of protein the
    // serving delivers — "25 g protein scoop" means 25 g of protein, not a
    // 25 g scoop of powder. The prompt tells the model to return proteinG=25
    // for this phrase, and the reconciler does not clamp the sum to the
    // stated gram number (the reconciler skips the weight cap on protein
    // supplements). Calories are still recomputed from macros via Atwater
    // (4*25 + 4*2 + 9*1 = 117), not the model's drifted 115.
    const result = buildMealParseResultFromAiSelection(
      {
        items: [],
        estimatedItems: [
          estimated({
            name: "Protein powder scoop 25gm with water",
            quantity: 1,
            unit: "scoop",
            calories: 115,
            proteinG: 25,
            carbsG: 2,
            fatsG: 1,
            fiberG: 0,
          }),
        ],
        unmatchedItems: [],
      },
      "snack",
    );

    expect(result.parsedItems[0].nutrition).toMatchObject({
      calories: 117,
      proteinG: 25,
      carbsG: 2,
      fatsG: 1,
    });
  });

  it("clamps macros so their sum cannot exceed a gram-weighted portion", () => {
    // A 50 g serving can never contain 60 g of protein. The reconciler scales
    // the three macros down proportionally to fit within the portion weight
    // and then recomputes kcal from those clamped macros.
    const result = buildMealParseResultFromAiSelection(
      {
        items: [],
        estimatedItems: [
          estimated({
            name: "Mystery powder",
            quantity: 50,
            unit: "gram",
            calories: 400,
            proteinG: 60,
            carbsG: 20,
            fatsG: 20,
            fiberG: 0,
          }),
        ],
        unmatchedItems: [],
      },
      "snack",
    );

    const nutrition = result.parsedItems[0].nutrition;
    expect(nutrition.proteinG + nutrition.carbsG + nutrition.fatsG).toBeLessThanOrEqual(50.1);
    expect(nutrition.calories).toBe(
      Math.round(4 * nutrition.proteinG + 4 * nutrition.carbsG + 9 * nutrition.fatsG),
    );
  });

  it("still works for text parsing, which sends no estimatedItems", () => {
    const result = buildMealParseResultFromAiSelection(
      {
        items: [
          { catalogId: "roti", quantity: 1, unit: "roti", matchedText: "1 roti", confidence: 0.9 },
        ],
        unmatchedItems: ["pickle"],
      },
      "lunch",
    );

    expect(result.parsedItems).toHaveLength(1);
    expect(result.unrecognizedSegments).toEqual(["pickle"]);
  });
});
