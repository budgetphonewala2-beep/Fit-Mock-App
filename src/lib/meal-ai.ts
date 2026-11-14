import { foodCatalog } from "@/lib/nutrition-dataset";
import { getOpenAiMealModel } from "@/lib/env";
import {
  buildMealParseResult,
  createParsedMealItem,
  getFoodCatalogById,
  normalizeUnit,
} from "@/lib/meal-catalog";
import type { MealParseResult, MealType, ParsedMealItem } from "@/lib/types";

type AiCatalogSelection = {
  catalogId: string;
  quantity: number;
  unit: string;
  matchedText: string;
  confidence: number;
};

// A food the photo clearly shows but the catalog doesn't have (ragi porridge,
// poha, upma...). The model names it and estimates nutrition for the portion
// in the photo, instead of forcing it onto the nearest catalog food.
type AiEstimatedItem = {
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

type AiMealExtraction = {
  items: AiCatalogSelection[];
  estimatedItems?: AiEstimatedItem[];
  unmatchedItems: string[];
};

// Estimates come from the model rather than the nutrition dataset, so they are
// kept in the sheet's low-confidence band (under 0.6) to show as "check this".
const ESTIMATED_ITEM_MAX_CONFIDENCE = 0.55;
const ESTIMATED_ITEM_MAX_CALORIES = 2500;

// Free-text estimates drift between calls because the model is non-deterministic.
// Lock the first estimate per (dish, unit) into an in-memory per-unit profile
// and reuse it on later calls, so the same dish reads the same from meal to
// meal. Lives on the serverless instance: warm instances share it across users.
type PerUnitEstimate = {
  unit: string;
  caloriesPerUnit: number;
  proteinPerUnit: number;
  carbsPerUnit: number;
  fatsPerUnit: number;
  fiberPerUnit: number;
  confidence: number;
};

const ESTIMATE_CACHE_MAX = 500;
const estimateCache = new Map<string, PerUnitEstimate>();

// Collapses variant Indian-food transliterations enough that trivial spelling
// drift ("pyaaz" vs "pyaz", "bhindhi" vs "bhindi") hits the same cache entry.
// Catalog aliases remain the authoritative fix for real synonyms; this is only
// meant to stop the estimator from drifting for the same dish typed the same
// way twice.
function normalizeEstimateKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/(.)\1+/g, "$1");
}

function recordEstimate(key: string, item: AiEstimatedItem, unit: string) {
  if (estimateCache.size >= ESTIMATE_CACHE_MAX) {
    const oldest = estimateCache.keys().next().value;
    if (oldest !== undefined) estimateCache.delete(oldest);
  }
  estimateCache.delete(key);
  estimateCache.set(key, {
    unit,
    caloriesPerUnit: item.calories / item.quantity,
    proteinPerUnit: item.proteinG / item.quantity,
    carbsPerUnit: item.carbsG / item.quantity,
    fatsPerUnit: item.fatsG / item.quantity,
    fiberPerUnit: item.fiberG / item.quantity,
    confidence: item.confidence,
  });
}

function stabilizeEstimate(item: AiEstimatedItem): AiEstimatedItem {
  const key = normalizeEstimateKey(item.name);
  const unit = normalizeUnit(item.unit) || "serving";
  if (!key || item.quantity <= 0) return item;

  const cached = estimateCache.get(key);
  if (!cached || cached.unit !== unit) {
    // First sighting, or a different unit shape for the same dish. We can't
    // safely scale across units (bowl vs gram vs piece), so treat it as a
    // fresh record keyed on the new unit.
    recordEstimate(key, item, unit);
    return item;
  }

  // Touch to refresh LRU order.
  estimateCache.delete(key);
  estimateCache.set(key, cached);

  return {
    ...item,
    calories: cached.caloriesPerUnit * item.quantity,
    proteinG: cached.proteinPerUnit * item.quantity,
    carbsG: cached.carbsPerUnit * item.quantity,
    fatsG: cached.fatsPerUnit * item.quantity,
    fiberG: cached.fiberPerUnit * item.quantity,
    confidence: Math.max(item.confidence, cached.confidence),
  };
}

// Exported for unit tests.
export function __resetMealEstimateCacheForTests() {
  estimateCache.clear();
}

export type PhotoMealAnalysis = MealParseResult & {
  previewText: string;
  matchedItems: string[];
};

const supportedUnits = Array.from(
  new Set(
    [
      "serving",
      "gram",
      "kilogram",
      "milliliter",
      "liter",
      ...foodCatalog.flatMap((item) =>
        item.portions.flatMap((portion) => [
          normalizeUnit(portion.unit),
          ...(portion.aliases ?? []).map((alias) => normalizeUnit(alias)),
        ]),
      ),
    ].filter(Boolean),
  ),
).sort();

const selectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          catalogId: {
            type: "string",
            enum: foodCatalog.map((item) => item.id),
          },
          quantity: {
            type: "number",
            exclusiveMinimum: 0,
          },
          unit: {
            type: "string",
            enum: [...supportedUnits],
          },
          matchedText: {
            type: "string",
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
        },
        required: ["catalogId", "quantity", "unit", "matchedText", "confidence"],
      },
    },
    unmatchedItems: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
  required: ["items", "unmatchedItems"],
} as const;

const photoSelectionSchema = {
  ...selectionSchema,
  properties: {
    ...selectionSchema.properties,
    estimatedItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          quantity: { type: "number", exclusiveMinimum: 0 },
          unit: { type: "string" },
          calories: { type: "number", minimum: 0 },
          proteinG: { type: "number", minimum: 0 },
          carbsG: { type: "number", minimum: 0 },
          fatsG: { type: "number", minimum: 0 },
          fiberG: { type: "number", minimum: 0 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: [
          "name",
          "quantity",
          "unit",
          "calories",
          "proteinG",
          "carbsG",
          "fatsG",
          "fiberG",
          "confidence",
        ],
      },
    },
  },
  required: ["items", "estimatedItems", "unmatchedItems"],
} as const;

function getOutputText(responseJson: unknown) {
  if (
    typeof responseJson === "object" &&
    responseJson !== null &&
    "output_text" in responseJson &&
    typeof responseJson.output_text === "string"
  ) {
    return responseJson.output_text;
  }

  if (
    typeof responseJson !== "object" ||
    responseJson === null ||
    !("output" in responseJson) ||
    !Array.isArray(responseJson.output)
  ) {
    return null;
  }

  for (const outputItem of responseJson.output) {
    if (
      typeof outputItem === "object" &&
      outputItem !== null &&
      "content" in outputItem &&
      Array.isArray(outputItem.content)
    ) {
      for (const contentItem of outputItem.content) {
        if (
          typeof contentItem === "object" &&
          contentItem !== null &&
          "type" in contentItem &&
          contentItem.type === "output_text" &&
          "text" in contentItem &&
          typeof contentItem.text === "string"
        ) {
          return contentItem.text;
        }
      }
    }
  }

  return null;
}

// The catalog rides along on every meal log, so it is written as one compact
// line per food instead of JSON (about 4k tokens instead of 20k), and it is
// the first block of the system message: identical across calls, so OpenAI's
// prompt cache can bill most of it at the cached rate.
// Line format: id | name | aka aliases | unit gramsPerUnit, ...
function buildCatalogPrompt() {
  const lines = foodCatalog.map((item) => {
    const name = item.name.toLowerCase();
    const aliases = item.aliases.filter((alias) => !name.startsWith(alias.toLowerCase()));
    const units = new Map<string, string>();
    for (const portion of item.portions) {
      const unit = normalizeUnit(portion.unit);
      if (unit && unit !== "gram" && !units.has(unit)) {
        units.set(unit, `${unit} ${Math.round(portion.grams / portion.quantity)}g`);
      }
    }
    return [
      item.id,
      item.name,
      ...(aliases.length ? [`aka ${aliases.join(", ")}`] : []),
      ...(units.size ? [Array.from(units.values()).join(", ")] : []),
    ].join(" | ");
  });

  return [
    "Food catalog, one food per line: id | name | aka other names | units with grams per unit.",
    "Every food also accepts gram, milliliter and serving as units.",
    ...lines,
  ].join("\n");
}

const CATALOG_PROMPT = buildCatalogPrompt();
const catalogSystemBlock = { type: "input_text", text: CATALOG_PROMPT } as const;
// Routes calls that share the catalog prefix to the same cache.
const CATALOG_CACHE_KEY = "fitmonk-meal-catalog";

function buildMatchedItemLabel(item: AiCatalogSelection) {
  const matchedText = item.matchedText.trim();

  if (matchedText) {
    return matchedText;
  }

  const catalogItem = getFoodCatalogById(item.catalogId);

  if (!catalogItem) {
    return item.catalogId;
  }

  const normalizedUnit = normalizeUnit(item.unit);
  const quantityLabel = Number.isInteger(item.quantity)
    ? String(item.quantity)
    : item.quantity.toFixed(1).replace(/\.0$/, "");

  if (normalizedUnit === "serving") {
    return quantityLabel === "1"
      ? catalogItem.name
      : `${quantityLabel} servings ${catalogItem.name}`;
  }

  return `${quantityLabel} ${normalizedUnit} ${catalogItem.name}`;
}

function buildPhotoMealPreview(extraction: AiMealExtraction) {
  const matchedItems = [
    ...extraction.items.map(buildMatchedItemLabel),
    ...(extraction.estimatedItems ?? []).map((item) => item.name),
  ]
    .map((label) => label.trim())
    .filter(Boolean);

  return {
    matchedItems,
    previewText: matchedItems.join(", "),
  };
}

function isAiMealExtraction(value: unknown): value is AiMealExtraction {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("items" in value) || !Array.isArray(value.items)) {
    return false;
  }

  if (!("unmatchedItems" in value) || !Array.isArray(value.unmatchedItems)) {
    return false;
  }

  if (
    "estimatedItems" in value &&
    !(Array.isArray(value.estimatedItems) && value.estimatedItems.every(isAiEstimatedItem))
  ) {
    return false;
  }

  return value.items.every((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    return (
      "catalogId" in item &&
      typeof item.catalogId === "string" &&
      "quantity" in item &&
      typeof item.quantity === "number" &&
      item.quantity > 0 &&
      "unit" in item &&
      typeof item.unit === "string" &&
      "matchedText" in item &&
      typeof item.matchedText === "string" &&
      "confidence" in item &&
      typeof item.confidence === "number"
    );
  });
}

function isAiEstimatedItem(item: unknown): item is AiEstimatedItem {
  if (typeof item !== "object" || item === null) {
    return false;
  }

  const record = item as Record<string, unknown>;
  const numberFields = ["quantity", "calories", "proteinG", "carbsG", "fatsG", "fiberG", "confidence"];

  return (
    typeof record.name === "string" &&
    typeof record.unit === "string" &&
    numberFields.every((field) => typeof record[field] === "number" && Number.isFinite(record[field]))
  );
}

function toNonNegative(value: number, max = Number.POSITIVE_INFINITY) {
  return Math.min(max, Math.max(0, value));
}

// For protein supplements, fitness users describe servings by the grams of
// protein the scoop delivers ("25 g protein scoop", "30gm whey") rather than
// the total powder weight. A gram number near one of these words is the
// protein amount, not the serving weight, so we must not treat it as a
// portion weight the macros have to fit inside.
const PROTEIN_SUPPLEMENT_KEYWORDS =
  /\b(protein|whey|casein|isolate|concentrate|gainer|bcaa|eaa|collagen)\b/i;

// Extracts an explicit portion weight (grams) for an AI estimate when it can
// be known from the unit/quantity (e.g. unit "gram" quantity 25) or from the
// name (e.g. "100g paneer", "50 ml milk"). Returns null when the portion's
// gram weight isn't knowable without guessing (bowls, cups, pieces, servings)
// or when the gram number in the name is a macro amount rather than the
// portion's own weight (e.g. "protein powder scoop 25 g").
function extractWeightGrams(item: AiEstimatedItem): number | null {
  const unit = normalizeUnit(item.unit);
  if ((unit === "gram" || unit === "milliliter") && item.quantity > 0) {
    return item.quantity;
  }

  if (PROTEIN_SUPPLEMENT_KEYWORDS.test(item.name)) {
    return null;
  }

  const match = item.name.match(/(\d+(?:\.\d+)?)\s*(?:g|gm|gms|gram|grams|ml|milliliter|milliliters)\b/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Guarantees a self-consistent macro breakdown: the three macro grams never
// exceed the portion's own weight (when that weight is knowable), and the
// displayed calories are always computed from the macros via Atwater (4/4/9).
// Without this, the model can return macros and calories that contradict each
// other — e.g. 20 g protein + 3 g carbs + 2 g fat alongside 100 kcal (true
// Atwater is 110). Users notice the mismatch immediately.
function reconcileMacrosAndCalories(item: AiEstimatedItem): AiEstimatedItem {
  let proteinG = toNonNegative(item.proteinG, 250);
  let carbsG = toNonNegative(item.carbsG, 500);
  let fatsG = toNonNegative(item.fatsG, 250);
  const fiberG = toNonNegative(item.fiberG, 100);

  const weightG = extractWeightGrams(item);
  if (weightG !== null) {
    // Each macro alone can never exceed the portion's total weight.
    proteinG = Math.min(proteinG, weightG);
    carbsG = Math.min(carbsG, weightG);
    fatsG = Math.min(fatsG, weightG);

    // The three macros together can't either. A tiny slack absorbs rounding
    // noise (0.5 g) before the proportional scale-down triggers.
    const total = proteinG + carbsG + fatsG;
    if (total > weightG + 0.5 && total > 0) {
      const scale = weightG / total;
      proteinG *= scale;
      carbsG *= scale;
      fatsG *= scale;
    }
  }

  const calories = Math.round(4 * proteinG + 4 * carbsG + 9 * fatsG);

  return {
    ...item,
    proteinG,
    carbsG,
    fatsG,
    fiberG,
    calories: Math.min(calories, ESTIMATED_ITEM_MAX_CALORIES),
  };
}

function createEstimatedMealItem(item: AiEstimatedItem): ParsedMealItem | null {
  const name = item.name.trim();

  if (!name || item.quantity <= 0) {
    return null;
  }

  const reconciled = reconcileMacrosAndCalories(item);

  return {
    name,
    quantity: item.quantity,
    unit: normalizeUnit(item.unit) || "serving",
    confidence: Math.max(0.3, Math.min(ESTIMATED_ITEM_MAX_CONFIDENCE, item.confidence)),
    nutrition: {
      calories: reconciled.calories,
      proteinG: Number(reconciled.proteinG.toFixed(1)),
      carbsG: Number(reconciled.carbsG.toFixed(1)),
      fatsG: Number(reconciled.fatsG.toFixed(1)),
      fiberG: Number(reconciled.fiberG.toFixed(1)),
      micros: {},
    },
  };
}

// Content words that are too generic to anchor a dish match: "chicken bharta"
// is not "chicken curry" even though both share "chicken".
const GENERIC_FOOD_WORDS = new Set([
  "chicken",
  "mutton",
  "paneer",
  "fish",
  "egg",
  "eggs",
  "veg",
  "vegetable",
  "vegetables",
  "mixed",
  "curry",
  "sabji",
  "sabzi",
  "gravy",
  "indian",
  "and",
  "with",
  "the",
  "raw",
  "plain",
  "fresh",
  "home",
  "cooked",
]);

// Quantity and portion words say how much, not what. "100 gram rajma" and
// "2 bowls rice" must still match Rajma and Rice; counting "gram" or "bowls"
// as a dish word made every unit-qualified phrase look like a different dish
// and silently dropped the correct catalog match.
const MEASURE_WORDS = new Set([
  "gram",
  "grams",
  "gms",
  "kilo",
  "kilos",
  "kilogram",
  "kilograms",
  "litre",
  "litres",
  "liter",
  "liters",
  "bowl",
  "bowls",
  "plate",
  "plates",
  "katori",
  "katoris",
  "cups",
  "glass",
  "glasses",
  "piece",
  "pieces",
  "slice",
  "slices",
  "serving",
  "servings",
  "portion",
  "portions",
  "spoon",
  "spoons",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "teaspoon",
  "teaspoons",
  "handful",
  "small",
  "medium",
  "large",
  "half",
  "full",
  "some",
  "little",
]);

function wordsOf(text: string) {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter(
    (word) => word.length >= 4 && !MEASURE_WORDS.has(word),
  );
}

// Keeps a catalog match only when the user's phrase and the catalog item name
// agree on their specific (non-generic) words. The model can't stand in paneer
// or chicken curry when the user wrote chicken bharta: "chicken" alone is too
// generic to anchor the match once "bharta" is also in the phrase.
function isCatalogMatchPlausible(matchedText: string, item: { name: string; aliases: string[] }) {
  const matchedWords = new Set(wordsOf(matchedText));

  if (matchedWords.size === 0) {
    return true;
  }

  const catalogWords = new Set([...wordsOf(item.name), ...item.aliases.flatMap(wordsOf)]);
  const specificMatchedMissing = [...matchedWords].filter(
    (word) => !catalogWords.has(word) && !GENERIC_FOOD_WORDS.has(word),
  );
  const specificCatalogMissing = [...catalogWords].filter(
    (word) => !matchedWords.has(word) && !GENERIC_FOOD_WORDS.has(word),
  );

  // User wrote something specific the catalog item doesn't name AND the
  // catalog item names something specific the user didn't write — different
  // dish, drop it.
  return !(specificMatchedMissing.length > 0 && specificCatalogMissing.length > 0);
}

export function buildMealParseResultFromAiSelection(
  extraction: AiMealExtraction,
  mealType: MealType,
): MealParseResult {
  const parsedItems = [];
  const unmatchedSegments = [...extraction.unmatchedItems];

  for (const selectedItem of extraction.items) {
    const item = getFoodCatalogById(selectedItem.catalogId);

    if (!item) {
      unmatchedSegments.push(selectedItem.matchedText);
      continue;
    }

    if (!isCatalogMatchPlausible(selectedItem.matchedText, item)) {
      // The model picked an unrelated dish for this phrase (e.g. paneer for
      // chicken bharta). Drop it so we don't double-count on top of whatever
      // the estimator returned for the real dish. If the model didn't also
      // estimate it, surface it as unmatched so the user can keep the phrase.
      const alreadyCovered = (extraction.estimatedItems ?? []).some((estimated) =>
        wordsOf(selectedItem.matchedText).some((word) =>
          wordsOf(estimated.name).includes(word),
        ),
      );

      if (!alreadyCovered) {
        unmatchedSegments.push(selectedItem.matchedText);
      }

      continue;
    }

    const parsedItem = createParsedMealItem({
      item,
      quantity: selectedItem.quantity,
      unit: normalizeUnit(selectedItem.unit),
      confidence: Math.max(0.4, Math.min(0.99, selectedItem.confidence)),
    });

    if (!parsedItem) {
      unmatchedSegments.push(selectedItem.matchedText);
      continue;
    }

    parsedItems.push(parsedItem);
  }

  for (const estimatedItem of extraction.estimatedItems ?? []) {
    const stabilized = stabilizeEstimate(estimatedItem);
    const parsedItem = createEstimatedMealItem(stabilized);

    if (parsedItem) {
      parsedItems.push(parsedItem);
    } else if (stabilized.name.trim()) {
      unmatchedSegments.push(stabilized.name.trim());
    }
  }

  return buildMealParseResult({
    parsedItems,
    unmatchedSegments,
    mealType,
  });
}

export async function parseMealTextWithAi(
  rawText: string,
  mealType: MealType,
): Promise<MealParseResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAiMealModel(),
      prompt_cache_key: CATALOG_CACHE_KEY,
      input: [
        {
          role: "system",
          content: [
            catalogSystemBlock,
            {
              type: "input_text",
              text:
                "You extract meal items from a typed description for a nutrition app, mostly Indian home food. HARD RULES: (1) Every item you return — in items, estimatedItems, or unmatchedItems — must correspond to a specific food phrase the user actually wrote. Never add a food the user did not write, even if you think it would commonly go with the meal; do not expand a single dish into its ingredients (chicken bharta is not 'chicken + paneer + onion'). (2) Each food phrase the user wrote appears in EXACTLY ONE output list, never in two. (3) A catalog item only matches a user phrase when the catalog item's name or an alias names THE SAME DISH as the user phrase — same preparation, not just the same protein. The last word (the dish type, e.g. bharta, bhurji, bhorta, poha, upma, khichdi, chila, pulao, biryani, tikka, curry) must align. Different dish types are never a match even when the protein is the same: 'chicken bharta' does NOT match 'chicken curry', 'butter chicken', 'chicken tikka', or 'grilled chicken' — bharta is its own dish. If the catalog has no entry whose name/alias names the same dish, the phrase goes to estimatedItems with the user's words as the name, never to the catalog as a near-cousin, and never into items at all. (4) Nutrition self-consistency for every estimatedItems entry: proteinG, carbsG and fatsG must each be non-negative. For a non-supplement food with a stated weight (e.g. '100 g paneer', '50 g biscuit'), proteinG + carbsG + fatsG must not exceed that weight. calories must always equal 4*proteinG + 4*carbsG + 9*fatsG, rounded to the nearest whole number. fiberG is a subset of carbsG, so fiberG <= carbsG. (5) Protein supplement rule: when the phrase names a protein supplement (whey, casein, isolate, mass gainer, 'protein powder', 'protein scoop', BCAA, EAA, collagen) AND states a gram number next to it (e.g. '25 g protein scoop', '30gm whey', '1 scoop 25g protein'), that gram number is the GRAMS OF PROTEIN the serving delivers, NOT the total weight of the powder. Return proteinG equal to that number and add the small realistic carbsG and fatsG typical of the supplement (whey isolate: ~1-3 g carbs, ~0-1 g fat; whey concentrate: ~3-5 g carbs, ~1-3 g fat; mass gainer: much higher carbs). Rule (4)'s weight cap does not apply in this case because the gram number is a macro amount, not a portion weight. HOW TO SORT EACH USER PHRASE: (a) if the phrase names the same dish as a catalog item (per rule 3), put it in items with that catalogId; (b) if it is a real dish the catalog does not have under the same name (for example chicken bharta, paneer bhurji, ragi porridge, poha, upma, khichdi, millet or a regional dish), put it in estimatedItems with its real common name, the stated or implied portion (quantity and a unit such as bowl, cup, piece, roti or gram) and your best nutrition estimate for that whole portion (calories, proteinG, carbsG, fatsG, fiberG); (c) only use unmatchedItems for phrases you genuinely cannot identify. Lower confidence when the dish or portion is uncertain. Ignore bracketed labels such as [Post workout]. Preserve explicit quantities and units from the meal text. Use 'serving' when quantity is implied rather than stated.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Meal type: ${mealType}\nMeal text: ${rawText}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meal_catalog_selection",
          schema: photoSelectionSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI meal extraction failed with status ${response.status}.`);
  }

  const responseJson = (await response.json()) as unknown;
  const outputText = getOutputText(responseJson);

  if (!outputText) {
    throw new Error("OpenAI meal extraction returned no structured output.");
  }

  const parsedJson = JSON.parse(outputText) as unknown;

  if (!isAiMealExtraction(parsedJson)) {
    throw new Error("OpenAI meal extraction returned an unexpected shape.");
  }

  return buildMealParseResultFromAiSelection(parsedJson, mealType);
}

export async function parseMealPhotoWithAi(
  imageDataUrl: string,
  mealType: MealType,
  hintText?: string,
): Promise<PhotoMealAnalysis> {
  const hintLine = hintText?.trim()
    ? `Optional user hint about the meal: ${hintText.trim()}`
    : "Optional user hint about the meal: none";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAiMealModel(),
      prompt_cache_key: CATALOG_CACHE_KEY,
      input: [
        {
          role: "system",
          content: [
            catalogSystemBlock,
            {
              type: "input_text",
              text:
                "You analyze meal photos for a nutrition app, mostly Indian home food. First identify what each visible food actually is, then estimate practical portions conservatively. If a food is genuinely the same as a catalog item, put it in items with that catalogId, and set matchedText to a short human-readable label like '2 roti', 'paneer sabji', or 'milk 250ml'. If it is a different dish that the catalog does not have (for example ragi porridge, dalia, poha, upma, khichdi, millet or a regional dish), do NOT substitute the closest catalog item: put it in estimatedItems with its real common name, the portion shown (quantity and a unit such as bowl, cup, piece or gram) and your best nutrition estimate for that whole portion (calories, proteinG, carbsG, fatsG, fiberG). Nutrition self-consistency for every estimatedItems entry: proteinG, carbsG and fatsG must each be non-negative. For a non-supplement food with a visible or stated weight (e.g. '100 g paneer'), proteinG + carbsG + fatsG must not exceed that weight. calories must always equal 4*proteinG + 4*carbsG + 9*fatsG, rounded to the nearest whole number. fiberG is a subset of carbsG, so fiberG <= carbsG. Protein supplement rule: when the hint or label names a protein supplement (whey, casein, isolate, mass gainer, 'protein powder', 'protein scoop', BCAA, EAA, collagen) AND states a gram number next to it, that number is the GRAMS OF PROTEIN the serving delivers, not the total powder weight. Return proteinG equal to that number and add the small realistic carbsG and fatsG typical of the supplement; the weight cap above does not apply in this case. Lower confidence when the dish or portion is uncertain. Use the optional hint as supporting context, never as a replacement for what you can see, though it can name a dish you can't tell apart by eye. Only use unmatchedItems for things you can see but cannot identify at all.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Meal type: ${mealType}\n${hintLine}`,
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meal_photo_catalog_selection",
          schema: photoSelectionSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI meal photo analysis failed with status ${response.status}.`);
  }

  const responseJson = (await response.json()) as unknown;
  const outputText = getOutputText(responseJson);

  if (!outputText) {
    throw new Error("OpenAI meal photo analysis returned no structured output.");
  }

  const parsedJson = JSON.parse(outputText) as unknown;

  if (!isAiMealExtraction(parsedJson)) {
    throw new Error("OpenAI meal photo analysis returned an unexpected shape.");
  }

  const parseResult = buildMealParseResultFromAiSelection(parsedJson, mealType);
  const preview = buildPhotoMealPreview(parsedJson);

  return {
    ...parseResult,
    previewText: preview.previewText,
    matchedItems: preview.matchedItems,
  };
}
