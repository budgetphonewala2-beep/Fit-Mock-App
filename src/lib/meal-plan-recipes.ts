import type { MealRecipeItem } from "@/lib/meal-plan-engine";
import type { MealType } from "@/lib/types";

/**
 * Every meal the planner can propose, expressed as catalog-priced ingredients.
 *
 * Nothing here states calories or protein. Those are read off the ingredients by
 * meal-plan-engine, so a dish shown in two different slots is scaled to each
 * slot's budget and its macros always describe the portions actually listed.
 */

export type DietFlags = {
  eatsMeat: boolean;
  eatsDairy: boolean;
  eatsEggs: boolean;
};

export type MealVariant = {
  title: string;
  items: MealRecipeItem[];
};

export type MealSlot = {
  id: string;
  time: string;
  mealType: MealType;
  /** Share of the day's calories. Shares across all slots sum to 1. */
  calorieShare: number;
  variants: MealVariant[];
};

const item = (catalogId: string, grams: number): MealRecipeItem => ({ catalogId, grams });

export function getMealSlots(flags: DietFlags): MealSlot[] {
  const { eatsMeat: meat, eatsDairy: dairy, eatsEggs: eggs } = flags;
  const milk = dairy ? "milk" : "soy-milk";
  const softProtein = dairy ? "paneer" : "tofu";

  // The diet page defaults each slot to `variants[0]`, so a slot's preferred
  // option needs to be first. `trigger` decides whether the animal-product
  // variant leads (eggetarians eat eggs but not chicken/fish, so breakfast
  // and lunch/dinner check different flags).
  const withPreferredFirst = (
    trigger: boolean,
    animalVariant: MealVariant,
    vegAlternative: MealVariant,
    vegVariants: MealVariant[],
  ): MealVariant[] =>
    trigger ? [animalVariant, ...vegVariants] : [...vegVariants, vegAlternative];

  return [
    {
      id: "breakfast",
      time: "7:30 AM",
      mealType: "breakfast",
      calorieShare: 0.24,
      variants: withPreferredFirst(
        eggs,
        {
          title: "Egg scramble & toast",
          items: [item("eggs", 150), item("bread-toast", 56), item("mixed-veg-sabzi", 80)],
        },
        {
          title: "Sprout bowl & toast",
          items: [
            item("moong-sprouts", 150),
            item("mixed-fruit", 120),
            item("bread-toast", 56),
            item("peanut-butter", 20),
            item("mixed-seeds", 10),
          ],
        },
        [
          {
            title: "Oats banana shake",
            items: [item("raw-oats", 60), item(milk, 250), item("banana", 100), item("peanut-butter", 16)],
          },
          {
            title: "Besan chilla plate (chickpea flour pancakes)",
            items: [item("besan", 60), item("mixed-veg-sabzi", 80), item(dairy ? "curd" : "green-salad", 100)],
          },
          {
            title: "Veg poha bowl (flattened rice)",
            items: [item("poha", 180), item("mixed-nuts", 15), item("mixed-fruit", 100)],
          },
        ],
      ),
    },
    {
      id: "morning-snack",
      time: "10:30 AM",
      mealType: "snack",
      calorieShare: 0.11,
      variants: [
        {
          title: "Protein snack",
          items: [item("roasted-chana", 40), item("mixed-fruit", 120)],
        },
        {
          // Sprouts alone are far too light to be a real snack — the roasted
          // chana and seeds are what make this reach the slot's budget at a
          // portion someone would actually eat.
          title: "Sprouts chaat",
          items: [
            item("moong-sprouts", 150),
            item("roasted-chana", 30),
            item("mixed-seeds", 10),
            item("tomato", 50),
            item("lemon", 10),
          ],
        },
        dairy
          ? { title: "Curd (yogurt) & seeds bowl", items: [item("curd", 250), item("mixed-seeds", 15)] }
          : { title: "Peanut butter toast", items: [item("bread-toast", 56), item("peanut-butter", 16)] },
      ],
    },
    {
      id: "lunch",
      time: "1:30 PM",
      mealType: "lunch",
      calorieShare: 0.29,
      variants: withPreferredFirst(
        meat,
        {
          title: "Chicken rice bowl",
          items: [item("grilled-chicken", 150), item("rice", 150), item("mixed-veg-sabzi", 100)],
        },
        {
          title: "Kabuli chana bowl (white chickpea stew)",
          items: [item("kabuli-chana-boiled", 180), item("rice", 150), item("green-salad", 100)],
        },
        [
          {
            title: "Lunch thali (mixed Indian plate)",
            items: [item("rice", 180), item("dal", 150), item(softProtein, 120), item("green-salad", 100)],
          },
          {
            title: "Rajma chawal (kidney bean curry & rice)",
            items: [item("rajma", 180), item("rice", 150), item("green-salad", 100)],
          },
          {
            title: "Chole & roti (chickpea curry with flatbread)",
            items: [item("chana-masala", 180), item("roti", 90), item("green-salad", 100)],
          },
        ],
      ),
    },
    {
      id: "pre-workout",
      time: "5:00 PM",
      mealType: "snack",
      calorieShare: 0.08,
      variants: [
        { title: "Pre-workout fuel", items: [item("banana", 120), item("dates", 16)] },
        { title: "Fruit & nuts", items: [item("mixed-fruit", 150), item("mixed-nuts", 15)] },
        { title: "Toast & peanut butter", items: [item("bread-toast", 28), item("peanut-butter", 16)] },
      ],
    },
    {
      id: "dinner",
      time: "8:30 PM",
      mealType: "dinner",
      calorieShare: 0.23,
      variants: withPreferredFirst(
        meat,
        {
          title: "Grilled fish & veg",
          items: [item("grilled-fish", 140), item("mixed-veg-sabzi", 150), item("roti", 60)],
        },
        {
          title: "Tofu bowl",
          items: [item("tofu", 160), item("mixed-veg-sabzi", 150), item("roti", 60)],
        },
        [
          {
            title: "Dinner plate",
            items: [item("roti", 90), item("mixed-veg-sabzi", 150), item("soy-chunks", 30), item("green-salad", 100)],
          },
          {
            title: "Moong khichdi plate (mung bean & rice porridge)",
            items: [item("moong-khichdi", 300), item(dairy ? "curd" : "green-salad", 150)],
          },
          {
            title: "Stir-fry & roti (with flatbread)",
            items: [item(softProtein, 120), item("roti", 60), item("mixed-veg-sabzi", 150)],
          },
        ],
      ),
    },
    {
      id: "bedtime",
      time: "10:30 PM",
      mealType: "snack",
      calorieShare: 0.05,
      variants: [
        { title: "Bedtime recovery", items: [item(milk, 200), item("mixed-nuts", 8)] },
        dairy
          ? { title: "Curd (yogurt) bowl", items: [item("curd", 200)] }
          : { title: "Warm soy milk", items: [item("soy-milk", 300)] },
        { title: "Milk & dates", items: [item(milk, 200), item("dates", 16)] },
      ],
    },
  ];
}
