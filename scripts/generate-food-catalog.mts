import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const inputPath = path.join(cwd, "data", "food-catalog.csv");
const outputDir = path.join(cwd, "src", "lib", "generated");
const outputPath = path.join(outputDir, "food-catalog-data.ts");

type CsvRow = Record<string, string>;

type PortionSeed = {
  label: string;
  quantity: number;
  unit: string;
  grams: number;
  aliases?: string[];
};

type FoodSeed = {
  id: string;
  name: string;
  aliases: string[];
  source: "dietfit-curated" | "dataset-import" | "external-provider";
  referenceUrl?: string;
  nutritionPer100g: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatsG: number;
    fiberG: number;
    micros: {
      calcium: number;
      iron: number;
      fiber: number;
      vitaminB12: number;
    };
  };
  portions: PortionSeed[];
  tags: string[];
};

const requiredColumns = [
  "id",
  "name",
  "aliases",
  "source",
  "tags",
  "calories_per100g",
  "protein_g_per100g",
  "carbs_g_per100g",
  "fats_g_per100g",
  "fiber_g_per100g",
  "calcium_mg_per100g",
  "iron_mg_per100g",
  "vitamin_b12_mcg_per100g",
  "portion_label",
  "portion_quantity",
  "portion_unit",
  "portion_grams",
] as const;

const optionalColumns = ["reference_url", "portion_aliases"] as const;

function parseCsv(source: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim().length > 0)) {
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    throw new Error("CSV is empty.");
  }

  return rows;
}

function splitList(value: string) {
  return value
    .split("|")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parseNumber(value: string, column: string, rowNumber: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number in column "${column}" on row ${rowNumber}.`);
  }
  return parsed;
}

function validateColumns(headers: string[]) {
  for (const column of [...requiredColumns, ...optionalColumns]) {
    if (!headers.includes(column)) {
      throw new Error(`Missing required CSV column "${column}".`);
    }
  }
}

function mapRows(rows: string[][]) {
  const [headerRow, ...bodyRows] = rows;
  const headers = headerRow.map((header) => header.trim());
  validateColumns(headers);

  return bodyRows.map((cells, index) => {
    const row: CsvRow = {};
    headers.forEach((header, cellIndex) => {
      row[header] = (cells[cellIndex] ?? "").trim();
    });

    const rowNumber = index + 2;
    for (const column of requiredColumns) {
      if (row[column] === "") {
        throw new Error(`Missing value for "${column}" on row ${rowNumber}.`);
      }
    }

    return row;
  });
}

function assertStaticFields(previous: FoodSeed, nextRow: CsvRow, rowNumber: number) {
  const staticFields = [
    ["name", previous.name, nextRow.name],
    ["aliases", previous.aliases.join("|"), splitList(nextRow.aliases).join("|")],
    ["source", previous.source, nextRow.source],
    ["reference_url", previous.referenceUrl ?? "", nextRow.reference_url],
    ["tags", previous.tags.join("|"), splitList(nextRow.tags).join("|")],
    ["calories_per100g", String(previous.nutritionPer100g.calories), nextRow.calories_per100g],
    ["protein_g_per100g", String(previous.nutritionPer100g.proteinG), nextRow.protein_g_per100g],
    ["carbs_g_per100g", String(previous.nutritionPer100g.carbsG), nextRow.carbs_g_per100g],
    ["fats_g_per100g", String(previous.nutritionPer100g.fatsG), nextRow.fats_g_per100g],
    ["fiber_g_per100g", String(previous.nutritionPer100g.fiberG), nextRow.fiber_g_per100g],
    ["calcium_mg_per100g", String(previous.nutritionPer100g.micros.calcium), nextRow.calcium_mg_per100g],
    ["iron_mg_per100g", String(previous.nutritionPer100g.micros.iron), nextRow.iron_mg_per100g],
    ["vitamin_b12_mcg_per100g", String(previous.nutritionPer100g.micros.vitaminB12), nextRow.vitamin_b12_mcg_per100g],
  ] as const;

  for (const [field, previousValue, nextValue] of staticFields) {
    if (previousValue !== nextValue) {
      throw new Error(`Conflicting "${field}" values for id "${previous.id}" on row ${rowNumber}.`);
    }
  }
}

function buildFoods(rows: CsvRow[]) {
  const foods = new Map<string, FoodSeed>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const source = row.source as FoodSeed["source"];

    if (!["dietfit-curated", "dataset-import", "external-provider"].includes(source)) {
      throw new Error(`Invalid source "${row.source}" on row ${rowNumber}.`);
    }

    const portion: PortionSeed = {
      label: row.portion_label,
      quantity: parseNumber(row.portion_quantity, "portion_quantity", rowNumber),
      unit: row.portion_unit.toLowerCase(),
      grams: parseNumber(row.portion_grams, "portion_grams", rowNumber),
      aliases: splitList(row.portion_aliases),
    };

    const existing = foods.get(row.id);
    if (!existing) {
      foods.set(row.id, {
        id: row.id,
        name: row.name,
        aliases: splitList(row.aliases),
        source,
        referenceUrl: row.reference_url || undefined,
        nutritionPer100g: {
          calories: parseNumber(row.calories_per100g, "calories_per100g", rowNumber),
          proteinG: parseNumber(row.protein_g_per100g, "protein_g_per100g", rowNumber),
          carbsG: parseNumber(row.carbs_g_per100g, "carbs_g_per100g", rowNumber),
          fatsG: parseNumber(row.fats_g_per100g, "fats_g_per100g", rowNumber),
          fiberG: parseNumber(row.fiber_g_per100g, "fiber_g_per100g", rowNumber),
          micros: {
            calcium: parseNumber(row.calcium_mg_per100g, "calcium_mg_per100g", rowNumber),
            iron: parseNumber(row.iron_mg_per100g, "iron_mg_per100g", rowNumber),
            fiber: parseNumber(row.fiber_g_per100g, "fiber_g_per100g", rowNumber),
            vitaminB12: parseNumber(row.vitamin_b12_mcg_per100g, "vitamin_b12_mcg_per100g", rowNumber),
          },
        },
        portions: [portion],
        tags: splitList(row.tags),
      });
      return;
    }

    assertStaticFields(existing, row, rowNumber);
    existing.portions.push(portion);
  });

  return [...foods.values()];
}

function formatGeneratedFile(foods: FoodSeed[]) {
  const payload = JSON.stringify(foods, null, 2).replace(/"referenceUrl": null,?\n/g, "");

  return `import type { FoodCatalogItem } from "@/lib/types";

// Generated from data/food-catalog.csv by scripts/generate-food-catalog.mts.
// Edit the CSV and rerun npm run catalog:build.
export const foodCatalog: FoodCatalogItem[] = ${payload};
`;
}

async function main() {
  const csv = await readFile(inputPath, "utf8");
  const foods = buildFoods(mapRows(parseCsv(csv)));

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, formatGeneratedFile(foods), "utf8");

  console.log(`Generated ${foods.length} foods in ${path.relative(cwd, outputPath)}.`);
}

await main();
