import {
  buildMealParseResult,
  createParsedMealItem,
  normalizeUnit,
  quantityWords,
  resolveFoodCatalogMatch,
} from "@/lib/meal-catalog";
import type { MealParseResult, MealType } from "@/lib/types";

function normalizeSegment(segment: string) {
  return segment
    .toLowerCase()
    .replace(/[.]/g, "")
    .trim();
}

function extractQuantity(segment: string) {
  const numericMatch = segment.match(/(\d+(\.\d+)?)/);

  if (numericMatch) {
    return Number(numericMatch[1]);
  }

  const [firstWord] = segment.split(" ");
  return quantityWords[firstWord] ?? 1;
}

function extractUnit(segment: string, fallbackUnit: string) {
  const tokens = segment.match(/[a-zA-Z]+/g) ?? [];
  const normalizedTokens = tokens.map((token) => normalizeUnit(token));
  const explicitUnit = normalizedTokens.find((token) =>
    [
      "gram",
      "kilogram",
      "milliliter",
      "liter",
      "tablespoon",
      fallbackUnit,
      "bowl",
      "cup",
      "glass",
      "plate",
      "serving",
    ].includes(token),
  );

  return explicitUnit ?? fallbackUnit;
}

function splitMeal(rawText: string) {
  return rawText
    .split(/,|\+|\s+(?:and|with)\s+/gi)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function parseMealText(rawText: string, mealType: MealType): MealParseResult {
  const segments = splitMeal(rawText);
  const parsedItems = [];
  const unrecognizedSegments: string[] = [];

  for (const segment of segments) {
    const normalized = normalizeSegment(segment);
    const match = resolveFoodCatalogMatch(normalized);

    if (!match) {
      unrecognizedSegments.push(segment);
      continue;
    }

    const quantity = extractQuantity(normalized);
    const fallbackUnit = match.item.portions[0]?.unit ?? "serving";
    const unit = extractUnit(normalized, normalizeUnit(fallbackUnit));
    const parsedItem = createParsedMealItem({
      item: match.item,
      quantity,
      unit,
      confidence: match.alias === match.item.name.toLowerCase() ? 0.92 : 0.8,
    });

    if (!parsedItem) {
      unrecognizedSegments.push(segment);
      continue;
    }

    parsedItems.push(parsedItem);
  }

  return buildMealParseResult({
    parsedItems,
    unmatchedSegments: unrecognizedSegments,
    mealType,
  });
}
