import type { FoodCatalogItem } from "@/lib/types";

// Generated from data/food-catalog.csv by scripts/generate-food-catalog.mts.
// Edit the CSV and rerun npm run catalog:build.
export const foodCatalog: FoodCatalogItem[] = [
  {
    "id": "roti",
    "name": "Roti (whole-wheat flatbread)",
    "aliases": [
      "roti",
      "chapati",
      "phulka"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 275,
      "proteinG": 7.5,
      "carbsG": 50,
      "fatsG": 5,
      "fiberG": 7.5,
      "micros": {
        "calcium": 0,
        "iron": 2.8,
        "fiber": 7.5,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 roti",
        "quantity": 1,
        "unit": "roti",
        "grams": 40,
        "aliases": [
          "chapati",
          "phulka"
        ]
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "paneer-sabji",
    "name": "Paneer Sabji (cottage cheese curry)",
    "aliases": [
      "paneer sabji",
      "paneer subji",
      "paneer curry",
      "paneer bhurji"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 122,
      "proteinG": 7.8,
      "carbsG": 5.6,
      "fatsG": 7.2,
      "fiberG": 1.7,
      "micros": {
        "calcium": 133.3,
        "iron": 0,
        "fiber": 1.7,
        "vitaminB12": 0.2
      }
    },
    "portions": [
      {
        "label": "1 bowl",
        "quantity": 1,
        "unit": "bowl",
        "grams": 180,
        "aliases": [
          "cup"
        ]
      }
    ],
    "tags": [
      "vegetarian",
      "dairy"
    ]
  },
  {
    "id": "paneer",
    "name": "Paneer (Indian cottage cheese)",
    "aliases": [
      "paneer",
      "cottage cheese"
    ],
    "source": "dataset-import",
    "nutritionPer100g": {
      "calories": 265,
      "proteinG": 18.3,
      "carbsG": 1.2,
      "fatsG": 20.8,
      "fiberG": 0,
      "micros": {
        "calcium": 208,
        "iron": 0.2,
        "fiber": 0,
        "vitaminB12": 0.8
      }
    },
    "portions": [
      {
        "label": "1 serving",
        "quantity": 1,
        "unit": "serving",
        "grams": 100,
        "aliases": []
      },
      {
        "label": "100 gram",
        "quantity": 100,
        "unit": "gram",
        "grams": 100,
        "aliases": []
      }
    ],
    "tags": [
      "vegetarian",
      "dairy"
    ]
  },
  {
    "id": "paneer-sandwich",
    "name": "Paneer Sandwich (cottage cheese sandwich)",
    "aliases": [
      "paneer sandwich",
      "grilled paneer sandwich",
      "paneer toastie"
    ],
    "source": "dataset-import",
    "nutritionPer100g": {
      "calories": 265,
      "proteinG": 14,
      "carbsG": 24,
      "fatsG": 13,
      "fiberG": 2,
      "micros": {
        "calcium": 180,
        "iron": 1.4,
        "fiber": 2,
        "vitaminB12": 0.4
      }
    },
    "portions": [
      {
        "label": "1 sandwich",
        "quantity": 1,
        "unit": "serving",
        "grams": 140,
        "aliases": [
          "sandwich"
        ]
      },
      {
        "label": "100 gram",
        "quantity": 100,
        "unit": "gram",
        "grams": 100,
        "aliases": []
      }
    ],
    "tags": [
      "vegetarian",
      "dairy"
    ]
  },
  {
    "id": "milk",
    "name": "Milk",
    "aliases": [
      "milk",
      "glass of milk"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 54.2,
      "proteinG": 3.3,
      "carbsG": 5,
      "fatsG": 2.1,
      "fiberG": 0,
      "micros": {
        "calcium": 125,
        "iron": 0,
        "fiber": 0,
        "vitaminB12": 0.3
      }
    },
    "portions": [
      {
        "label": "1 glass",
        "quantity": 1,
        "unit": "glass",
        "grams": 240,
        "aliases": []
      },
      {
        "label": "1 cup",
        "quantity": 1,
        "unit": "cup",
        "grams": 240,
        "aliases": []
      }
    ],
    "tags": [
      "vegetarian",
      "dairy"
    ]
  },
  {
    "id": "soybean",
    "name": "Soybean",
    "aliases": [
      "soybean",
      "soya bean",
      "soyabean"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 173,
      "proteinG": 18.2,
      "carbsG": 8.4,
      "fatsG": 8.5,
      "fiberG": 6,
      "micros": {
        "calcium": 102,
        "iron": 5.1,
        "fiber": 6,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "100 gram",
        "quantity": 100,
        "unit": "gram",
        "grams": 100,
        "aliases": []
      },
      {
        "label": "1 bowl",
        "quantity": 1,
        "unit": "bowl",
        "grams": 172,
        "aliases": [
          "cup"
        ]
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "soya-bean-salad",
    "name": "Soya Bean Salad",
    "aliases": [
      "soya bean salad",
      "soybean salad",
      "soya salad",
      "soy salad",
      "soyabean salad"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 170,
      "proteinG": 16,
      "carbsG": 12,
      "fatsG": 6,
      "fiberG": 5,
      "micros": {
        "calcium": 0,
        "iron": 3.2,
        "fiber": 5,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "100 gram",
        "quantity": 100,
        "unit": "gram",
        "grams": 100,
        "aliases": []
      },
      {
        "label": "1 bowl",
        "quantity": 1,
        "unit": "bowl",
        "grams": 120,
        "aliases": [
          "cup"
        ]
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "cucumber",
    "name": "Cucumber",
    "aliases": [
      "cucumber",
      "kheera"
    ],
    "source": "dataset-import",
    "nutritionPer100g": {
      "calories": 15,
      "proteinG": 0.7,
      "carbsG": 3.6,
      "fatsG": 0.1,
      "fiberG": 0.5,
      "micros": {
        "calcium": 16,
        "iron": 0.3,
        "fiber": 0.5,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 serving",
        "quantity": 1,
        "unit": "serving",
        "grams": 50,
        "aliases": []
      },
      {
        "label": "100 gram",
        "quantity": 100,
        "unit": "gram",
        "grams": 100,
        "aliases": []
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "onion",
    "name": "Onion",
    "aliases": [
      "onion",
      "pyaz"
    ],
    "source": "dataset-import",
    "nutritionPer100g": {
      "calories": 40,
      "proteinG": 1.1,
      "carbsG": 9.3,
      "fatsG": 0.1,
      "fiberG": 1.7,
      "micros": {
        "calcium": 23,
        "iron": 0.2,
        "fiber": 1.7,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 serving",
        "quantity": 1,
        "unit": "serving",
        "grams": 30,
        "aliases": []
      },
      {
        "label": "100 gram",
        "quantity": 100,
        "unit": "gram",
        "grams": 100,
        "aliases": []
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "dal",
    "name": "Dal (lentil stew)",
    "aliases": [
      "dal",
      "daal",
      "lentils"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 100,
      "proteinG": 5.6,
      "carbsG": 13.9,
      "fatsG": 2.2,
      "fiberG": 3.9,
      "micros": {
        "calcium": 0,
        "iron": 1.2,
        "fiber": 3.9,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 bowl",
        "quantity": 1,
        "unit": "bowl",
        "grams": 180,
        "aliases": [
          "cup"
        ]
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "rajma",
    "name": "Rajma (kidney bean curry)",
    "aliases": [
      "rajma",
      "kidney beans",
      "rajma curry",
      "rajma chawal"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 127.1,
      "proteinG": 8.7,
      "carbsG": 22.8,
      "fatsG": 0.5,
      "fiberG": 6.4,
      "micros": {
        "calcium": 0,
        "iron": 2.9,
        "fiber": 6.4,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 bowl",
        "quantity": 1,
        "unit": "bowl",
        "grams": 177,
        "aliases": [
          "cup"
        ]
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "rice",
    "name": "Cooked Rice",
    "aliases": [
      "rice",
      "plain rice",
      "steamed rice"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 129.7,
      "proteinG": 2.5,
      "carbsG": 28.5,
      "fatsG": 0,
      "fiberG": 0.6,
      "micros": {
        "calcium": 0,
        "iron": 0,
        "fiber": 0.6,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 bowl",
        "quantity": 1,
        "unit": "bowl",
        "grams": 158,
        "aliases": [
          "cup"
        ]
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "curd",
    "name": "Curd (yogurt)",
    "aliases": [
      "curd",
      "dahi",
      "yogurt"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 40,
      "proteinG": 2,
      "carbsG": 3.3,
      "fatsG": 2,
      "fiberG": 0,
      "micros": {
        "calcium": 73.5,
        "iron": 0,
        "fiber": 0,
        "vitaminB12": 0.2
      }
    },
    "portions": [
      {
        "label": "1 bowl",
        "quantity": 1,
        "unit": "bowl",
        "grams": 245,
        "aliases": [
          "cup"
        ]
      }
    ],
    "tags": [
      "vegetarian",
      "dairy"
    ]
  },
  {
    "id": "oats",
    "name": "Oats Bowl",
    "aliases": [
      "oatmeal",
      "porridge",
      "cooked oats",
      "oats bowl"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 81.2,
      "proteinG": 2.6,
      "carbsG": 13.7,
      "fatsG": 1.7,
      "fiberG": 2.1,
      "micros": {
        "calcium": 0,
        "iron": 0.6,
        "fiber": 2.1,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 bowl",
        "quantity": 1,
        "unit": "bowl",
        "grams": 234,
        "aliases": [
          "cup"
        ]
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "banana",
    "name": "Banana",
    "aliases": [
      "banana"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 89,
      "proteinG": 0.8,
      "carbsG": 22.9,
      "fatsG": 0,
      "fiberG": 2.5,
      "micros": {
        "calcium": 0,
        "iron": 0,
        "fiber": 2.5,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 banana",
        "quantity": 1,
        "unit": "banana",
        "grams": 118,
        "aliases": []
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "raw-oats",
    "name": "Raw Oats",
    "aliases": [
      "oats",
      "rolled oats",
      "raw oats",
      "dry oats"
    ],
    "source": "dataset-import",
    "nutritionPer100g": {
      "calories": 379,
      "proteinG": 13.15,
      "carbsG": 67.7,
      "fatsG": 6.52,
      "fiberG": 10.1,
      "micros": {
        "calcium": 52,
        "iron": 4.25,
        "fiber": 10.1,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 serving",
        "quantity": 1,
        "unit": "serving",
        "grams": 40,
        "aliases": []
      },
      {
        "label": "100 gram",
        "quantity": 100,
        "unit": "gram",
        "grams": 100,
        "aliases": []
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "peanut-butter",
    "name": "Peanut Butter",
    "aliases": [
      "peanut butter",
      "groundnut butter"
    ],
    "source": "dataset-import",
    "nutritionPer100g": {
      "calories": 588,
      "proteinG": 25,
      "carbsG": 20,
      "fatsG": 50,
      "fiberG": 6,
      "micros": {
        "calcium": 43,
        "iron": 1.9,
        "fiber": 6,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 tablespoon",
        "quantity": 1,
        "unit": "tablespoon",
        "grams": 16,
        "aliases": [
          "tbsp",
          "spoon",
          "spoons"
        ]
      },
      {
        "label": "100 gram",
        "quantity": 100,
        "unit": "gram",
        "grams": 100,
        "aliases": []
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "eggs",
    "name": "Eggs",
    "aliases": [
      "egg",
      "eggs",
      "omelette",
      "omelet",
      "boiled egg"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 144,
      "proteinG": 12,
      "carbsG": 1,
      "fatsG": 10,
      "fiberG": 0,
      "micros": {
        "calcium": 0,
        "iron": 0,
        "fiber": 0,
        "vitaminB12": 1.1
      }
    },
    "portions": [
      {
        "label": "2 eggs",
        "quantity": 2,
        "unit": "egg",
        "grams": 100,
        "aliases": []
      },
      {
        "label": "1 egg",
        "quantity": 1,
        "unit": "egg",
        "grams": 50,
        "aliases": []
      }
    ],
    "tags": [
      "meat"
    ]
  },
  {
    "id": "chicken-curry",
    "name": "Chicken Curry",
    "aliases": [
      "chicken curry",
      "chicken",
      "grilled chicken"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 150,
      "proteinG": 16.9,
      "carbsG": 5,
      "fatsG": 6.9,
      "fiberG": 0.6,
      "micros": {
        "calcium": 0,
        "iron": 0.8,
        "fiber": 0.6,
        "vitaminB12": 0.6
      }
    },
    "portions": [
      {
        "label": "1 bowl",
        "quantity": 1,
        "unit": "bowl",
        "grams": 160,
        "aliases": [
          "cup"
        ]
      }
    ],
    "tags": [
      "meat"
    ]
  },
  {
    "id": "fish-curry",
    "name": "Fish Curry",
    "aliases": [
      "fish curry",
      "fish fry",
      "fish"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 146.7,
      "proteinG": 16,
      "carbsG": 4,
      "fatsG": 6.7,
      "fiberG": 0,
      "micros": {
        "calcium": 0,
        "iron": 0,
        "fiber": 0,
        "vitaminB12": 1.5
      }
    },
    "portions": [
      {
        "label": "1 serving",
        "quantity": 1,
        "unit": "serving",
        "grams": 150,
        "aliases": []
      }
    ],
    "tags": [
      "meat"
    ]
  },
  {
    "id": "idli",
    "name": "Idli (steamed rice-lentil cake)",
    "aliases": [
      "idli",
      "idlis"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 120,
      "proteinG": 4,
      "carbsG": 24,
      "fatsG": 1,
      "fiberG": 2,
      "micros": {
        "calcium": 0,
        "iron": 0,
        "fiber": 2,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "2 idli",
        "quantity": 2,
        "unit": "idli",
        "grams": 100,
        "aliases": []
      },
      {
        "label": "1 idli",
        "quantity": 1,
        "unit": "idli",
        "grams": 50,
        "aliases": []
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "dosa",
    "name": "Dosa (rice-lentil crepe)",
    "aliases": [
      "dosa",
      "plain dosa",
      "masala dosa"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 126.7,
      "proteinG": 2.7,
      "carbsG": 18.7,
      "fatsG": 4.7,
      "fiberG": 1.3,
      "micros": {
        "calcium": 0,
        "iron": 0,
        "fiber": 1.3,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 dosa",
        "quantity": 1,
        "unit": "dosa",
        "grams": 150,
        "aliases": []
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "besan-chilla",
    "name": "Besan Chilla (chickpea flour pancake)",
    "aliases": [
      "besan chilla",
      "besan cheela",
      "besan chila",
      "besan ka chilla",
      "besan ka cheela",
      "gram flour chilla",
      "chickpea flour chilla"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 180,
      "proteinG": 9,
      "carbsG": 22,
      "fatsG": 6,
      "fiberG": 4,
      "micros": {
        "calcium": 35,
        "iron": 2.4,
        "fiber": 4,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 chilla",
        "quantity": 1,
        "unit": "chilla",
        "grams": 80,
        "aliases": []
      },
      {
        "label": "100 gram",
        "quantity": 100,
        "unit": "gram",
        "grams": 100,
        "aliases": []
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "semolina-pasta",
    "name": "Semolina Pasta",
    "aliases": [
      "semolina pasta",
      "cooked semolina pasta",
      "boiled semolina pasta",
      "plain semolina pasta"
    ],
    "source": "dataset-import",
    "nutritionPer100g": {
      "calories": 157,
      "proteinG": 5.8,
      "carbsG": 31,
      "fatsG": 1.2,
      "fiberG": 1.8,
      "micros": {
        "calcium": 8,
        "iron": 1.1,
        "fiber": 1.8,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 bowl",
        "quantity": 1,
        "unit": "bowl",
        "grams": 150,
        "aliases": [
          "cup"
        ]
      },
      {
        "label": "100 gram",
        "quantity": 100,
        "unit": "gram",
        "grams": 100,
        "aliases": []
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  },
  {
    "id": "salad",
    "name": "Salad",
    "aliases": [
      "salad",
      "veg salad",
      "vegetable salad"
    ],
    "source": "dietfit-curated",
    "nutritionPer100g": {
      "calories": 58.3,
      "proteinG": 1.7,
      "carbsG": 8.3,
      "fatsG": 1.7,
      "fiberG": 3.3,
      "micros": {
        "calcium": 0,
        "iron": 0.7,
        "fiber": 3.3,
        "vitaminB12": 0
      }
    },
    "portions": [
      {
        "label": "1 bowl",
        "quantity": 1,
        "unit": "bowl",
        "grams": 120,
        "aliases": [
          "cup"
        ]
      }
    ],
    "tags": [
      "vegan",
      "vegetarian"
    ]
  }
];
