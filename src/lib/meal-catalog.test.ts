import { describe, expect, it } from "vitest";
import { buildMealParseResult, mergeParsedItems } from "@/lib/meal-catalog";
import { parseMealText } from "@/lib/meal-parser";
import type { ParsedMealItem } from "@/lib/types";

function item(name: string, quantity: number, unit: string, calories: number, confidence = 0.9): ParsedMealItem {
  return {
    name,
    quantity,
    unit,
    confidence,
    nutrition: {
      calories,
      proteinG: calories / 50,
      carbsG: calories / 5,
      fatsG: 0,
      fiberG: 0,
      micros: { ironMg: 0.1 },
    },
  };
}

describe("merging identical foods", () => {
  // The reported sheet: five "100 gram Cooked Rice" rows and a "200 gram" one.
  it("combines the same food in the same unit into one row", () => {
    const rice = [
      ...Array.from({ length: 5 }, () => item("Cooked Rice", 100, "gram", 130)),
      item("Cooked Rice", 200, "gram", 260),
      item("Curd (yogurt)", 200, "gram", 120),
    ];

    const merged = mergeParsedItems(rice);

    expect(merged.map((row) => [row.name, row.quantity, row.unit])).toEqual([
      ["Cooked Rice", 700, "gram"],
      ["Curd (yogurt)", 200, "gram"],
    ]);
    expect(merged[0].nutrition.calories).toBe(910);
    expect(merged[0].nutrition.micros.ironMg).toBeCloseTo(0.6);
  });

  it("keeps different units apart, since they can't be added", () => {
    const merged = mergeParsedItems([
      item("Cooked Rice", 1, "bowl", 200),
      item("Cooked Rice", 100, "gram", 130),
    ]);

    expect(merged).toHaveLength(2);
  });

  it("takes the least sure confidence for a combined row", () => {
    const [row] = mergeParsedItems([
      item("Roti", 1, "piece", 100, 0.95),
      item("Roti", 1, "piece", 100, 0.5),
    ]);

    expect(row.quantity).toBe(2);
    expect(row.confidence).toBe(0.5);
  });

  it("leaves the meal total and match confidence unchanged", () => {
    const result = buildMealParseResult({
      parsedItems: [item("Cooked Rice", 100, "gram", 130), item("Cooked Rice", 100, "gram", 130)],
      unmatchedSegments: ["mumble"],
      mealType: "lunch",
    });

    expect(result.parsedItems).toHaveLength(1);
    expect(result.estimatedNutrition.calories).toBe(260);
    // Two of three mentions matched, counted before combining.
    expect(result.confidence).toBe(0.67);
  });

  it("applies to the local parser too", () => {
    const result = parseMealText("100 gram rice, 100 gram rice, 200 gram rice", "lunch");
    const riceRows = result.parsedItems.filter((row) => /rice/i.test(row.name));

    expect(riceRows).toHaveLength(1);
    expect(riceRows[0].quantity).toBe(400);
  });
});
