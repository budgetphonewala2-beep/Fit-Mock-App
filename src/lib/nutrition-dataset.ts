import { foodCatalog as generatedFoodCatalog } from "@/lib/generated/food-catalog-data";
import { supplementalFoodCatalog } from "@/lib/food-catalog-supplemental";

export const foodCatalog = [
  ...generatedFoodCatalog,
  ...supplementalFoodCatalog,
];
