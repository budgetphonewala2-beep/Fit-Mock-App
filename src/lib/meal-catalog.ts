import { foodCatalog } from "@/lib/nutrition-dataset";
import { addNutrition, scaleNutrition, zeroNutrition } from "@/lib/recommendations";
import type {
  FoodCatalogItem,
  FoodPortion,
  MealParseResult,
  MealType,
  ParsedMealItem,
} from "@/lib/types";

export const quantityWords: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
};

export function normalizeUnit(unit: string) {
  const normalized = unit.toLowerCase().replace(/[^a-z]/g, "");

  if (!normalized) {
    return "serving";
  }

  const aliases: Record<string, string> = {
    g: "gram",
    gm: "gram",
    gram: "gram",
    grams: "gram",
    ml: "milliliter",
    milliliter: "milliliter",
    milliliters: "milliliter",
    l: "liter",
    litre: "liter",
    litres: "liter",
    liter: "liter",
    liters: "liter",
    kg: "kilogram",
    kilo: "kilogram",
    kilogram: "kilogram",
    kilograms: "kilogram",
    bowl: "bowl",
    bowls: "bowl",
    cup: "cup",
    cups: "cup",
    glass: "glass",
    glasses: "glass",
    tbsp: "tablespoon",
    tablespoon: "tablespoon",
    tablespoons: "tablespoon",
    spoon: "tablespoon",
    spoons: "tablespoon",
    plate: "plate",
    plates: "plate",
    roti: "roti",
    rotis: "roti",
    chapati: "roti",
    chapatis: "roti",
    phulka: "roti",
    phulkas: "roti",
    egg: "egg",
    eggs: "egg",
    banana: "banana",
    bananas: "banana",
    idli: "idli",
    idlis: "idli",
    dosa: "dosa",
    dosas: "dosa",
    serving: "serving",
    servings: "serving",
  };

  if (aliases[normalized]) {
    return aliases[normalized];
  }

  return normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
}

export function unitsAreCompatible(left: string, right: string) {
  if (left === right) {
    return true;
  }

  const groupedUnits = [
    new Set(["bowl", "cup"]),
    new Set(["milliliter", "liter", "glass", "cup"]),
    new Set(["tablespoon"]),
    new Set(["roti"]),
    new Set(["egg"]),
    new Set(["banana"]),
    new Set(["idli"]),
    new Set(["dosa"]),
  ];
  return groupedUnits.some((group) => group.has(left) && group.has(right));
}

function getMatchingPortion(item: FoodCatalogItem, unit: string): FoodPortion | null {
  for (const portion of item.portions) {
    if (unitsAreCompatible(unit, portion.unit)) {
      return portion;
    }

    if ((portion.aliases ?? []).some((alias) => unitsAreCompatible(unit, normalizeUnit(alias)))) {
      return portion;
    }
  }

  return null;
}

export function getQuantityGrams(
  quantity: number,
  unit: string,
  item: FoodCatalogItem,
) {
  if (unit === "gram") {
    return quantity;
  }

  if (unit === "kilogram") {
    return quantity * 1000;
  }

  if (unit === "milliliter") {
    return quantity;
  }

  if (unit === "liter") {
    return quantity * 1000;
  }

  if (unit === "serving") {
    const portion = item.portions[0];
    return portion ? (quantity / portion.quantity) * portion.grams : null;
  }

  const portion = getMatchingPortion(item, unit);
  if (!portion) {
    return null;
  }

  return (quantity / portion.quantity) * portion.grams;
}

export function resolveFoodCatalogMatch(segment: string) {
  const matches = foodCatalog
    .map((item) => ({
      item,
      alias: item.aliases.find((alias) => segment.includes(alias)),
    }))
    .filter((entry) => entry.alias)
    .sort((left, right) => (right.alias?.length ?? 0) - (left.alias?.length ?? 0));

  if (segment.includes("oat")) {
    const cookedOatsMatch = matches.find((entry) => entry.item.id === "oats");
    const rawOatsMatch = matches.find((entry) => entry.item.id === "raw-oats");

    if (
      segment.includes("oatmeal") ||
      segment.includes("porridge") ||
      segment.includes("cooked oats") ||
      segment.includes("oats bowl") ||
      segment.includes("bowl") ||
      segment.includes("cup")
    ) {
      return cookedOatsMatch ?? rawOatsMatch;
    }

    return rawOatsMatch ?? cookedOatsMatch;
  }

  return matches[0];
}

export function createParsedMealItem(args: {
  item: FoodCatalogItem;
  quantity: number;
  unit: string;
  confidence: number;
}): ParsedMealItem | null {
  const grams = getQuantityGrams(args.quantity, args.unit, args.item);

  if (grams === null) {
    return null;
  }

  return {
    name: args.item.name,
    quantity: args.quantity,
    unit: args.unit,
    confidence: args.confidence,
    nutrition: scaleNutrition(args.item.nutritionPer100g, grams / 100),
  };
}

export function buildCoachTip(mealType: MealType, proteinG: number) {
  const proteinSummary =
    proteinG >= 25
      ? "Nice protein hit."
      : "Consider adding a protein anchor like dal, paneer, eggs, tofu, chicken, or curd.";

  return `${mealType[0].toUpperCase()}${mealType.slice(1)} logged. ${proteinSummary}`;
}

/**
 * One row per food. A meal that names the same food more than once (or a
 * garbled voice transcript that repeats it) came back as a row per mention:
 * five "100 gram Cooked Rice" rows. Rows for the same food in the same unit
 * are combined with their amounts and nutrition added up. Different units
 * ("1 bowl" and "100 gram") stay apart, since those amounts can't be added.
 */
export function mergeParsedItems(items: ParsedMealItem[]): ParsedMealItem[] {
  const merged: ParsedMealItem[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    const key = `${item.name.toLowerCase()}|${item.unit.toLowerCase()}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length);
      merged.push(item);
      continue;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      quantity: Number((existing.quantity + item.quantity).toFixed(2)),
      // The combined row is only as sure as its least sure part.
      confidence: Math.min(existing.confidence, item.confidence),
      nutrition: addNutrition(existing.nutrition, item.nutrition),
    };
  }

  return merged;
}

export function buildMealParseResult(args: {
  parsedItems: ParsedMealItem[];
  unmatchedSegments: string[];
  mealType: MealType;
}): MealParseResult {
  const estimatedNutrition = args.parsedItems.reduce(
    (total, item) => addNutrition(total, item.nutrition),
    zeroNutrition(),
  );

  // Confidence is the share of mentions matched, so it counts them before
  // identical foods are combined.
  const totalSegments = args.parsedItems.length + args.unmatchedSegments.length;
  const confidence = totalSegments === 0 ? 0 : Number((args.parsedItems.length / totalSegments).toFixed(2));

  return {
    parsedItems: mergeParsedItems(args.parsedItems),
    estimatedNutrition,
    confidence,
    unrecognizedSegments: args.unmatchedSegments,
    coachTip: buildCoachTip(args.mealType, estimatedNutrition.proteinG),
  };
}

export function getFoodCatalogById(id: string) {
  return foodCatalog.find((item) => item.id === id) ?? null;
}
