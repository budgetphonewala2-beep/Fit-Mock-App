import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { exerciseLibrary, mealSuggestionCatalog } from "@/lib/seed-data";
import { buildMealFromRecipe, buildMealWithItems } from "@/lib/meal-plan-engine";
import { getMealSlots } from "@/lib/meal-plan-recipes";
import {
  clamp,
  slugify,
  startOfTodayIso,
  toLocalIsoDate,
  titleCase,
} from "@/lib/utils";
import type {
  DietaryPreference,
  DietTimelineMeal,
  FoodFlags,
  Exercise,
  FitnessExperience,
  MealLog,
  MealSuggestion,
  MicronutrientTargets,
  NutritionSummary,
  NutritionTargets,
  OnboardingInput,
  ParsedMealItem,
  PrimaryGoal,
  UserProfile,
  Weekday,
  WorkoutLog,
  WorkoutLoadLog,
  WorkoutPlan,
  WorkoutSession,
} from "@/lib/types";
import { WEEKDAYS_IN_ORDER } from "@/lib/types";

const dailyTemplate: Weekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const weeksPerMonth = 4.345;

export function getFoodFlagsForDietaryPreference(
  preference: DietaryPreference,
): FoodFlags {
  if (preference === "vegan") {
    return { eatsMeat: false, eatsDairy: false, eatsEggs: false };
  }

  if (preference === "non-vegetarian") {
    return { eatsMeat: true, eatsDairy: true, eatsEggs: true };
  }

  if (preference === "eggetarian") {
    return { eatsMeat: false, eatsDairy: true, eatsEggs: true };
  }

  return { eatsMeat: false, eatsDairy: true, eatsEggs: false };
}

export function getDietaryPreferenceLabel(preference: DietaryPreference) {
  return {
    vegetarian: "Vegetarian",
    vegan: "Vegan",
    eggetarian: "Eggetarian",
    "non-vegetarian": "Non-vegetarian",
  }[preference];
}

export function getDefaultGoalTargetKg(goal: PrimaryGoal) {
  if (goal === "lose-weight") {
    return 5;
  }

  if (goal === "build-muscle") {
    return 4;
  }

  if (goal === "maintain") {
    return 0;
  }

  return null;
}

export function getDefaultGoalDurationMonths(goal: PrimaryGoal) {
  if (goal === "lose-weight" || goal === "build-muscle" || goal === "maintain") {
    return 3;
  }

  return null;
}

function formatMonths(months: number) {
  if (months < 1) {
    const weeks = Math.round(months * weeksPerMonth);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  const rounded = Math.round(months);
  return `${rounded} ${rounded === 1 ? "month" : "months"}`;
}

function getGoalTargetValue(profile: Pick<UserProfile, "primaryGoal" | "goalTargetKg">) {
  return profile.goalTargetKg ?? getDefaultGoalTargetKg(profile.primaryGoal);
}

function getGoalDurationValue(profile: Pick<UserProfile, "primaryGoal" | "goalDurationMonths">) {
  return profile.goalDurationMonths ?? getDefaultGoalDurationMonths(profile.primaryGoal);
}

function getBaseGoalOffset(goal: PrimaryGoal) {
  return {
    "lose-weight": -350,
    maintain: 0,
    "build-muscle": 240,
    "improve-endurance": 120,
    "target-body-area": 80,
    "competition-prep": 180,
  }[goal];
}

function getActivityMultiplier(activityLevel: UserProfile["activityLevel"]) {
  // Mifflin-St Jeor activity factors (Harris-Benedict scale)
  return {
    "mostly-sedentary": 1.2,   // desk job / little exercise
    "lightly-active": 1.375,   // light exercise 1-3 days/week
    active: 1.55,              // moderate exercise 3-5 days/week
    "very-active": 1.725,      // hard exercise 6-7 days/week
  }[activityLevel];
}

function getBmrCalories(profile: UserProfile) {
  const sexAdjustment =
    profile.sex === "male"
      ? 5
      : profile.sex === "female"
        ? -161
        : -78;

  return 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + sexAdjustment;
}

function getMaintenanceCalories(profile: UserProfile) {
  return getBmrCalories(profile) * getActivityMultiplier(profile.activityLevel);
}

function getProteinGPerKg(profile: UserProfile) {
  const activityBaseline = {
    "mostly-sedentary": 0.8,
    "lightly-active": 1.2,
    active: 1.4,
    "very-active": 1.6,
  }[profile.activityLevel];

  const goalBaseline = {
    "lose-weight": 2.0,       // High protein preserves muscle in deficit (ISSN: 1.8-2.7)
    maintain: 1.6,            // Raised from 1.2 — active maintainers need more
    "build-muscle": 1.9,      // ISSN: 1.6-2.2 g/kg
    "improve-endurance": 1.6, // ISSN: 1.2-1.6 g/kg
    "target-body-area": 1.6,
    "competition-prep": 2.0,
  }[profile.primaryGoal];

  return round(Math.max(activityBaseline, goalBaseline));
}

export function getGoalCalculationDetails(profile: UserProfile) {
  const targetKg = getGoalTargetValue(profile);
  const durationMonths = getGoalDurationValue(profile);
  const bmrCalories = Math.round(getBmrCalories(profile));
  const activityMultiplier = getActivityMultiplier(profile.activityLevel);
  const maintenanceCalories = Math.round(getMaintenanceCalories(profile));
  const durationWeeks =
    durationMonths && durationMonths > 0
      ? Math.round(durationMonths * weeksPerMonth * 10) / 10
      : null;

  let paceKgPerWeek: number | null = null;
  let dailyCalorieAdjustment = getBaseGoalOffset(profile.primaryGoal);
  let calorieAdjustmentPercent = round((dailyCalorieAdjustment / maintenanceCalories) * 100);

  if (
    (profile.primaryGoal === "lose-weight" || profile.primaryGoal === "build-muscle") &&
    targetKg !== null &&
    targetKg !== undefined &&
    durationWeeks &&
    durationWeeks > 0
  ) {
    paceKgPerWeek = round(targetKg / durationWeeks);
    const rawAdjustment = Math.round((paceKgPerWeek * 7700) / 7);
    const sign = profile.primaryGoal === "lose-weight" ? -1 : 1;
    const minPercent = profile.primaryGoal === "lose-weight" ? 15 : 5;
    const maxPercent = profile.primaryGoal === "lose-weight" ? 25 : 15;
    const adjustmentPercentMagnitude = round(
      clamp((rawAdjustment / maintenanceCalories) * 100, minPercent, maxPercent),
    );
    calorieAdjustmentPercent = adjustmentPercentMagnitude * sign;
    dailyCalorieAdjustment =
      Math.round((maintenanceCalories * adjustmentPercentMagnitude) / 100) * sign;
  } else {
    calorieAdjustmentPercent = {
      "lose-weight": -15,
      maintain: 0,
      "build-muscle": 8,
      "improve-endurance": 5,
      "target-body-area": 0,
      "competition-prep": 5,
    }[profile.primaryGoal];
    dailyCalorieAdjustment = Math.round(
      (maintenanceCalories * Math.abs(calorieAdjustmentPercent)) / 100,
    );

    if (calorieAdjustmentPercent < 0) {
      dailyCalorieAdjustment *= -1;
    }
  }

  return {
    targetKg: targetKg ?? null,
    durationMonths: durationMonths ?? null,
    durationWeeks,
    paceKgPerWeek,
    bmrCalories,
    maintenanceCalories,
    activityMultiplier,
    calorieAdjustmentPercent,
    dailyCalorieAdjustment,
  };
}

export function getGoalSummary(profile: UserProfile) {
  const targetKg = getGoalTargetValue(profile);
  const durationMonths = getGoalDurationValue(profile);
  const timeline = durationMonths ? ` in ${formatMonths(durationMonths)}` : "";

  if (profile.primaryGoal === "lose-weight") {
    const goalKg = targetKg ?? 5;

    return {
      eyebrow: "Weight goal",
      headline: `Lose ${goalKg} kg${timeline}`,
      subline: `From ${profile.weightKg} kg → ${Math.max(profile.weightKg - goalKg, 0)} kg`,
      detail: "Steady fat loss with enough protein and repeatable training.",
    };
  }

  if (profile.primaryGoal === "build-muscle") {
    const goalKg = targetKg ?? 4;

    return {
      eyebrow: "Muscle goal",
      headline: `Gain ${goalKg} kg muscle${timeline}`,
      subline: `Build toward ${profile.weightKg + goalKg} kg`,
      detail: "Progressive training, better recovery, and enough calories to grow.",
    };
  }

  if (profile.primaryGoal === "maintain") {
    return {
      eyebrow: "Maintenance goal",
      headline: `Stay near ${profile.weightKg} kg${timeline}`,
      subline: "Hold your weight while improving energy and consistency",
      detail: "Keep the routine smooth, recover well, and stay close to baseline.",
    };
  }

  if (profile.primaryGoal === "target-body-area") {
    return {
      eyebrow: "Focus goal",
      headline: `Build ${profile.secondaryFocus}`,
      subline: `${profile.preferredWorkoutDays} training days each week`,
      detail: "Sessions are tilted toward the area you want to improve most.",
    };
  }

  if (profile.primaryGoal === "improve-endurance") {
    return {
      eyebrow: "Endurance goal",
      headline: "Build lasting stamina",
      subline: `${profile.preferredWorkoutDays} sessions per week`,
      detail: "More capacity, cleaner pacing, and better recovery between efforts.",
    };
  }

  return {
    eyebrow: "Performance goal",
    headline: "Prepare for your event",
    subline: `${profile.preferredWorkoutDays} focused sessions per week`,
    detail: "Train with structure, keep recovery high, and sharpen for the big day.",
  };
}

export function getWorkoutWeekLabel(appStartedAt: string | undefined, dateIso: string) {
  if (!appStartedAt) {
    return "Week 0";
  }

  const dayDifference = Math.max(
    0,
    differenceInCalendarDays(parseISO(dateIso), parseISO(appStartedAt)),
  );

  return `Week ${Math.floor(dayDifference / 7)}`;
}

export function getDisplaySessionNote(note: string | null | undefined) {
  const legacyRecoveryNote =
    "Take a lighter day, log your meals, and stay consistent with sleep and hydration.";

  if (!note || note.trim() === legacyRecoveryNote) {
    return "";
  }

  return note;
}

export function zeroNutrition(): NutritionSummary {
  return {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatsG: 0,
    fiberG: 0,
    micros: {
      calcium: 0,
      iron: 0,
      fiber: 0,
      vitaminB12: 0,
    },
  };
}

export function addNutrition(
  left: NutritionSummary,
  right: NutritionSummary,
): NutritionSummary {
  const keys = new Set([...Object.keys(left.micros), ...Object.keys(right.micros)]);
  const micros = Object.fromEntries(
    Array.from(keys).map((key) => [key, (left.micros[key] ?? 0) + (right.micros[key] ?? 0)]),
  );

  return {
    calories: left.calories + right.calories,
    proteinG: left.proteinG + right.proteinG,
    carbsG: left.carbsG + right.carbsG,
    fatsG: left.fatsG + right.fatsG,
    fiberG: left.fiberG + right.fiberG,
    micros,
  };
}

export function scaleNutrition(summary: NutritionSummary, multiplier: number): NutritionSummary {
  return {
    calories: Math.round(summary.calories * multiplier),
    proteinG: round(summary.proteinG * multiplier),
    carbsG: round(summary.carbsG * multiplier),
    fatsG: round(summary.fatsG * multiplier),
    fiberG: round(summary.fiberG * multiplier),
    micros: Object.fromEntries(
      Object.entries(summary.micros).map(([key, value]) => [key, round(value * multiplier)]),
    ),
  };
}

export function getDietTimelineMealNutrition(
  meal: Pick<DietTimelineMeal, "calories" | "proteinG" | "carbsG" | "fatsG">,
): NutritionSummary {
  return {
    ...zeroNutrition(),
    calories: meal.calories,
    proteinG: meal.proteinG,
    carbsG: meal.carbsG,
    fatsG: meal.fatsG,
  };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function deriveActivityLevel(exerciseFrequency: string) {
  if (exerciseFrequency.includes("0") || exerciseFrequency.includes("1")) {
    return "mostly-sedentary" as const;
  }

  if (exerciseFrequency.includes("2") || exerciseFrequency.includes("3")) {
    return "lightly-active" as const;
  }

  if (exerciseFrequency.includes("4") || exerciseFrequency.includes("5")) {
    return "active" as const;
  }

  return "very-active" as const;
}

export function normalizeProfile(input: OnboardingInput): UserProfile {
  return {
    ...input,
    activityLevel: deriveActivityLevel(input.exerciseFrequency),
  };
}

// One daily water target for everyone. The earlier sex-based values (3.7L
// men, 2.7L women, 3.0L otherwise) were NHANES adequate intakes for total
// water, food included, so they overshot what the tracker logs: drinks only.
// 2.5L is reachable for almost everyone and sits mid-range of that guidance.
export const DAILY_WATER_TARGET_L = 2.5;

// Brings saved targets onto the standard water value. Targets are stored at
// onboarding, so existing users would otherwise keep the old sex-based one.
export function withStandardWaterTarget(targets: NutritionTargets): NutritionTargets {
  if (targets.micros.waterL === DAILY_WATER_TARGET_L) {
    return targets;
  }
  return {
    ...targets,
    micros: { ...targets.micros, waterL: DAILY_WATER_TARGET_L },
    keyMicros: targets.keyMicros.map((micro) =>
      micro.name === "water" ? { ...micro, target: DAILY_WATER_TARGET_L } : micro,
    ),
  };
}

export function getMicronutrientTargets(
  profile: UserProfile,
  calories: number,
): MicronutrientTargets {
  const isFemale = profile.sex === "female";
  return {
    fiberG: Math.round((calories / 1000) * 14),
    waterL: DAILY_WATER_TARGET_L,
    creatineG: 3,
    // RDA: 8mg men, 18mg premenopausal women
    ironMg: isFemale ? 18 : 8,
    vitaminDMcg: 20,
    zincMg: isFemale ? 8 : 11,
    magnesiumMg: isFemale ? 320 : 420,
    vitaminB12Mcg: 2.4,
    calciumMg: 1000,
  };
}

export function calculateNutritionTargets(profile: UserProfile): NutritionTargets {
  const {
    activityMultiplier,
    bmrCalories,
    calorieAdjustmentPercent,
    dailyCalorieAdjustment,
    maintenanceCalories,
  } = getGoalCalculationDetails(profile);

  const calories = Math.round(clamp(maintenanceCalories + dailyCalorieAdjustment, 1400, 4000));
  const proteinGPerKg = getProteinGPerKg(profile);
  // Cap protein at 35% of total calories so it doesn't crowd out carbs for heavier users
  const proteinGUncapped = Math.round(profile.weightKg * proteinGPerKg);
  const proteinG = Math.min(proteinGUncapped, Math.round((calories * 0.35) / 4));
  // Goal-adjusted fat: endurance needs more carbs so uses 22%; default 28%
  const fatPercentOfCalories = profile.primaryGoal === "improve-endurance" ? 22 : 28;
  const fatsG = Math.round((calories * (fatPercentOfCalories / 100)) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatsG * 9) / 4));
  const micros = getMicronutrientTargets(profile, calories);

  return {
    calories,
    proteinG,
    carbsG,
    fatsG,
    meta: {
      equation: "mifflin-st-jeor",
      bmrCalories,
      tdeeCalories: maintenanceCalories,
      activityMultiplier,
      calorieAdjustmentPercent,
      calorieAdjustment: dailyCalorieAdjustment,
      proteinGPerKg,
      fatPercentOfCalories,
    },
    keyMicros: [
      { name: "calcium", target: micros.calciumMg, unit: "mg" },
      { name: "iron", target: micros.ironMg, unit: "mg" },
      { name: "fiber", target: micros.fiberG, unit: "g" },
      { name: "vitaminB12", target: micros.vitaminB12Mcg, unit: "mcg" },
      { name: "vitaminD", target: micros.vitaminDMcg, unit: "mcg" },
      { name: "zinc", target: micros.zincMg, unit: "mg" },
      { name: "magnesium", target: micros.magnesiumMg, unit: "mg" },
      { name: "water", target: micros.waterL, unit: "L" },
      { name: "creatine", target: micros.creatineG, unit: "g" },
    ],
    micros,
  };
}

function scalePlannedMeal(
  meal: Omit<DietTimelineMeal, "calories" | "proteinG" | "carbsG" | "fatsG"> & {
    caloriesRatio: number;
    proteinRatio: number;
    carbsRatio: number;
    fatsRatio: number;
  },
  targets: NutritionTargets,
): DietTimelineMeal {
  return {
    id: meal.id,
    time: meal.time,
    title: meal.title,
    mealType: meal.mealType,
    quantity: meal.quantity,
    purpose: meal.purpose,
    calories: Math.round(targets.calories * meal.caloriesRatio),
    proteinG: Math.round(targets.proteinG * meal.proteinRatio),
    carbsG: Math.round(targets.carbsG * meal.carbsRatio),
    fatsG: Math.round(targets.fatsG * meal.fatsRatio),
  };
}

export function formatDietTimelineMealLogText(meal: Pick<DietTimelineMeal, "title" | "quantity">) {
  return `${meal.title}: ${meal.quantity}`;
}

/**
 * Builds the day's meals from catalog-priced ingredients (see meal-plan-engine).
 * Macros are read off the actual portions, never assigned separately, so the
 * numbers on a meal always describe the food listed on it.
 */
export function generateDietTimelinePlan(
  profile: UserProfile,
  targets: NutritionTargets,
): DietTimelineMeal[] {
  return generateDietTimelineVariants(profile, targets).map((slot) => slot[0]);
}

/**
 * Every alternative for each slot, already scaled to that slot's calorie budget.
 * "Suggest another" walks this list, so a swapped dish is priced by the same
 * engine as the default one — its macros always match the portions shown.
 */
/**
 * Full plan structure: each slot with its budget share and every option built
 * *and* its scaled ingredients. The ingredients are what let the day adapter
 * re-cost a meal later without inventing numbers.
 */
export function generateDietTimelineOptions(profile: UserProfile, targets: NutritionTargets) {
  const flags = {
    eatsMeat: profile.foodFlags.eatsMeat,
    eatsDairy: profile.foodFlags.eatsDairy,
    eatsEggs: profile.foodFlags.eatsEggs,
  };

  return getMealSlots(flags).map((slot) => ({
    id: slot.id,
    time: slot.time,
    mealType: slot.mealType,
    calorieShare: slot.calorieShare,
    options: slot.variants.map((variant) =>
      buildMealWithItems(
        {
          id: slot.id,
          time: slot.time,
          mealType: slot.mealType,
          title: variant.title,
          calorieShare: slot.calorieShare,
          items: variant.items,
        },
        targets.calories,
      ),
    ),
  }));
}

/** Slot metadata (budget share, timing) needed to request an extra AI option. */
export function getDietTimelineSlotMeta(profile: UserProfile) {
  return getMealSlots({
    eatsMeat: profile.foodFlags.eatsMeat,
    eatsDairy: profile.foodFlags.eatsDairy,
    eatsEggs: profile.foodFlags.eatsEggs,
  }).map((slot) => ({
    id: slot.id,
    time: slot.time,
    mealType: slot.mealType,
    calorieShare: slot.calorieShare,
  }));
}

export function generateDietTimelineVariants(
  profile: UserProfile,
  targets: NutritionTargets,
): DietTimelineMeal[][] {
  const flags = {
    eatsMeat: profile.foodFlags.eatsMeat,
    eatsDairy: profile.foodFlags.eatsDairy,
    eatsEggs: profile.foodFlags.eatsEggs,
  };

  return getMealSlots(flags).map((slot) =>
    slot.variants.map((variant) =>
      buildMealFromRecipe(
        {
          id: slot.id,
          time: slot.time,
          mealType: slot.mealType,
          title: variant.title,
          calorieShare: slot.calorieShare,
          items: variant.items,
        },
        targets.calories,
      ),
    ),
  );
}

const DEFAULT_ACTIVE_DAY_TEMPLATES: Record<number, Weekday[]> = {
  2: ["Monday", "Thursday"],
  3: ["Monday", "Wednesday", "Friday"],
  4: ["Monday", "Tuesday", "Thursday", "Saturday"],
  5: ["Monday", "Tuesday", "Wednesday", "Friday", "Saturday"],
  6: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

/**
 * The weekdays the plan schedules training on. A user's own picks
 * (`preferredWorkoutWeekdays`) always win — dedupe + reorder to match the
 * canonical week and drop anything unrecognised. Fall back to the
 * count-based template only when nothing has been picked, so a legacy
 * profile behaves exactly the way it used to.
 */
export function getActiveDays(profile: {
  preferredWorkoutDays: number;
  preferredWorkoutWeekdays?: Weekday[];
}): Weekday[] {
  const picked = profile.preferredWorkoutWeekdays;

  if (picked && picked.length > 0) {
    const known = new Set(WEEKDAYS_IN_ORDER);
    const seen = new Set<Weekday>();
    for (const day of picked) {
      if (known.has(day)) {
        seen.add(day);
      }
    }
    if (seen.size > 0) {
      return WEEKDAYS_IN_ORDER.filter((day) => seen.has(day));
    }
  }

  return (
    DEFAULT_ACTIVE_DAY_TEMPLATES[profile.preferredWorkoutDays] ??
    DEFAULT_ACTIVE_DAY_TEMPLATES[4]
  );
}

function goalFocus(goal: PrimaryGoal, secondaryFocus: string) {
  if (goal === "build-muscle") {
    return ["upper-body", "legs", "posterior-chain"];
  }

  if (goal === "lose-weight") {
    return ["full-body", "cardio", "core"];
  }

  if (goal === "improve-endurance" || goal === "competition-prep") {
    return ["cardio", "legs", "core"];
  }

  return [slugify(secondaryFocus), "full-body", "mobility"];
}

function allowedForEnvironment(environment: UserProfile["workoutEnvironment"]) {
  return exerciseLibrary.filter((exercise) =>
    exercise.environment.includes("both") || exercise.environment.includes(environment),
  );
}

function allowedForExperience(experience: FitnessExperience, ids: Set<string>) {
  return exerciseLibrary.filter(
    (exercise) => exercise.difficulty.includes(experience) && ids.has(exercise.id),
  );
}

function chooseExerciseNames(
  profile: UserProfile,
  focusAreas: string[],
  sessionIndex: number,
): Exercise[] {
  const injurySet = new Set(profile.injuries.map((injury) => slugify(injury)));
  const environmentIds = new Set(
    allowedForEnvironment(profile.workoutEnvironment).map((exercise) => exercise.id),
  );

  const candidates = allowedForExperience(profile.fitnessExperience, environmentIds).filter(
    (exercise) =>
      !exercise.contraindications.some((item) => injurySet.has(slugify(item))),
  );

  const warmup =
    candidates.find((exercise) => exercise.type === "warmup") ?? exerciseLibrary[0];
  const foundation =
    candidates.find((exercise) =>
      focusAreas.some((focus) => exercise.focusAreas.includes(focus)),
    ) ?? candidates.find((exercise) => exercise.type === "strength");
  const secondary =
    candidates.filter(
      (exercise) =>
        exercise.id !== warmup.id &&
        exercise.id !== foundation?.id &&
        (focusAreas.some((focus) => exercise.focusAreas.includes(focus)) ||
          exercise.goalTags.includes(profile.primaryGoal)),
    ) ?? [];
  const finisher =
    candidates.find((exercise) => exercise.type === "mobility") ??
    candidates.find((exercise) => exercise.type === "conditioning");

  const rotatingSecondary =
    secondary.length > 0 ? secondary[sessionIndex % secondary.length] : undefined;

  return [warmup, foundation, rotatingSecondary, finisher].filter(
    (exercise): exercise is Exercise => Boolean(exercise),
  );
}

export function generateWorkoutPlan(profile: UserProfile): WorkoutPlan {
  const activeDays = getActiveDays(profile);
  const focusAreas = goalFocus(profile.primaryGoal, profile.secondaryFocus);
  const durationMin = clamp(24 + profile.preferredWorkoutDays * 6, 28, 52);

  const dailySessions: WorkoutSession[] = dailyTemplate.map((dayLabel, index) => {
    const isRestDay = !activeDays.includes(dayLabel);

    if (isRestDay) {
      return {
        id: slugify(`${dayLabel}-reset`),
        dayLabel,
        title: "Recovery & reset",
        focus: "Mobility and habits",
        durationMin: 15,
        note: "",
        isRestDay: true,
        exercises: [],
      };
    }

    const exerciseChoices = chooseExerciseNames(profile, focusAreas, index);
    const sessionFocus = index % 2 === 0 ? profile.secondaryFocus : titleCase(focusAreas[0]);

    return {
      id: slugify(`${dayLabel}-${sessionFocus}`),
      dayLabel,
      title: `${titleCase(sessionFocus)} session`,
      focus: `${titleCase(focusAreas[index % focusAreas.length])} priority`,
      durationMin,
      note: "",
      isRestDay: false,
      exercises: exerciseChoices.map((exercise, exerciseIndex) => ({
        id: `${exercise.id}-${index}-${exerciseIndex}`,
        name: exercise.name,
        type: exercise.type,
        reps:
          exercise.type === "warmup"
            ? "5 minutes"
            : exercise.type === "conditioning"
              ? "4 rounds"
              : exerciseIndex === 0
                ? "3 x 8-10"
                : "3 x 10-12",
        guidance: exercise.guidance,
        emphasis:
          exerciseIndex === 0
            ? "Prime the body"
            : exerciseIndex === 1
              ? "Base movement"
              : "Goal-specific push",
        reason:
          exercise.focusAreas.includes(slugify(profile.secondaryFocus))
            ? `Chosen to support your ${profile.secondaryFocus.toLowerCase()} focus.`
            : `Fits your ${profile.primaryGoal.replace(/-/g, " ")} goal and ${profile.workoutEnvironment} setup.`,
        equipment: exercise.equipment,
      })),
    };
  });

  return {
    weeklyStructure: `${profile.preferredWorkoutDays} training days with smart recovery and daily food tracking.`,
    dailySessions,
    focusAreas,
    progressionNotes: [
      "Week 1 is about showing up and learning the flow. Keep 1-2 reps in reserve.",
      "Add 1 extra rep or a little more control before increasing load.",
      "If a movement irritates an injury flag, switch to the nearest low-impact option.",
    ],
  };
}

export function getTodaysSession(plan: WorkoutPlan | null) {
  return getSessionForDate(plan, startOfTodayIso());
}

export function getSessionForDate(plan: WorkoutPlan | null, dateIso: string) {
  if (!plan || plan.dailySessions.length === 0) {
    return null;
  }

  const weekday = format(parseISO(dateIso), "EEEE");
  return plan.dailySessions.find((session) => session.dayLabel === weekday) ?? plan.dailySessions[0];
}

export function generateCoachNote(
  profile: UserProfile,
  nutritionTargets: NutritionTargets,
  workoutPlan: WorkoutPlan,
) {
  const todaySession = getTodaysSession(workoutPlan);

  return `${profile.name}, this plan is tuned for ${profile.primaryGoal.replace(
    /-/g,
    " ",
  )}. Your nutrition target starts around ${nutritionTargets.calories} kcal with ${
    nutritionTargets.proteinG
  }g protein, and today's emphasis is ${
    todaySession?.focus.toLowerCase() ?? "steady consistency"
  }. Stay relaxed, finish the basics, and let the streak build.`;
}

export function getNutritionForDate(logs: MealLog[], dateIso: string) {
  return logs
    .filter((log) => log.loggedAt.startsWith(dateIso))
    .reduce((total, log) => addNutrition(total, log.estimatedNutrition), zeroNutrition());
}

export function calculateWorkoutCompletion(
  sessionId: string | null,
  workoutLogs: WorkoutLog[],
  exerciseCount: number,
  sessionDate = startOfTodayIso(),
) {
  if (!sessionId) {
    return 0;
  }

  const sessionLog = workoutLogs.find(
    (log) => log.sessionDate === sessionDate && log.sessionId === sessionId,
  );

  if (!sessionLog || exerciseCount === 0) {
    return 0;
  }

  return clamp(sessionLog.exercisesCompleted.length / exerciseCount, 0, 1);
}

export function generateMealSuggestions(
  profile: UserProfile | null,
  logs: MealLog[],
  nutritionTargets: NutritionTargets | null,
): MealSuggestion[] {
  if (!profile || !nutritionTargets) {
    return mealSuggestionCatalog.slice(0, 3);
  }

  const recentFoods = logs
    .flatMap((log) => log.parsedItems.map((item) => item.name.toLowerCase()))
    .slice(0, 8);
  const proteinGap = nutritionTargets.proteinG - getNutritionForDate(logs, startOfTodayIso()).proteinG;
  const compatibleTag = !profile.foodFlags.eatsMeat
    ? profile.foodFlags.eatsDairy
      ? "vegetarian"
      : "vegan"
    : "meat";

  const ranked = mealSuggestionCatalog
    .filter((suggestion) => {
      if (compatibleTag === "vegan") {
        return suggestion.tags.includes("vegan");
      }

      if (compatibleTag === "vegetarian") {
        return !suggestion.tags.includes("meat");
      }

      return true;
    })
    .map((suggestion) => ({
      suggestion,
      score:
        (recentFoods.some((food) => suggestion.description.toLowerCase().includes(food)) ? 2 : 0) +
        (proteinGap > 35 ? suggestion.proteinG / 10 : suggestion.calories < 450 ? 1 : 0),
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.suggestion);

  return ranked.slice(0, 3);
}

export function calculatePoints(workoutLogs: WorkoutLog[], mealLogs: MealLog[]) {
  return workoutLogs.filter((log) => log.completedSession).length * 20 + mealLogs.length * 6;
}

export function calculateStreak(
  workoutLogs: WorkoutLog[],
  mealLogs: MealLog[],
  workoutLoadLogs: WorkoutLoadLog[] = [],
  waterLogs: { date: string; amountMl: number }[] = [],
  nutritionTargets: { proteinG: number; micros: { waterL: number } } | null = null,
) {
  const workoutDates = new Set([
    ...workoutLogs
      .filter((log) => log.completedSession || log.exercisesCompleted.length > 0)
      .map((log) => log.sessionDate),
    ...workoutLoadLogs.map((log) => log.sessionDate),
  ]);

  // protein: ≥80% of daily target on that date
  const proteinDates = new Set<string>();
  if (nutritionTargets) {
    const byDate = new Map<string, number>();
    for (const log of mealLogs) {
      const d = toLocalIsoDate(new Date(log.loggedAt));
      byDate.set(d, (byDate.get(d) ?? 0) + log.estimatedNutrition.proteinG);
    }
    const threshold = nutritionTargets.proteinG * 0.8;
    for (const [date, total] of byDate) {
      if (total >= threshold) proteinDates.add(date);
    }
  }

  // hydration: ≥90% of daily water target
  const hydrationDates = new Set<string>();
  if (nutritionTargets) {
    const targetMl = nutritionTargets.micros.waterL * 1000;
    for (const log of waterLogs) {
      if (log.amountMl >= targetMl * 0.9) hydrationDates.add(log.date);
    }
  }

  // A day counts if any one milestone is met
  const allDates = new Set([...workoutDates, ...proteinDates, ...hydrationDates]);
  const eligibleDates = Array.from(allDates).sort();

  if (eligibleDates.length === 0) {
    return 0;
  }

  let streak = 0;
  const cursor = new Date(`${startOfTodayIso()}T00:00:00`);

  while (eligibleDates.includes(toLocalIsoDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function onboardingToPlan(input: OnboardingInput) {
  const profile = normalizeProfile(input);
  const nutritionTargets = calculateNutritionTargets(profile);
  const workoutPlan = generateWorkoutPlan(profile);
  const coachNote = generateCoachNote(profile, nutritionTargets, workoutPlan);
  const mealSuggestions = generateMealSuggestions(profile, [], nutritionTargets);

  return {
    profile,
    nutritionTargets,
    workoutPlan,
    coachNote,
    mealSuggestions,
  };
}

export function createMealLog(args: {
  rawText: string;
  mealType: MealLog["mealType"];
  parsedItems: ParsedMealItem[];
  estimatedNutrition: NutritionSummary;
  confidence: number;
  coachTip: string;
}) {
  return {
    id: slugify(`${args.mealType}-${args.rawText}-${Date.now()}`),
    rawText: args.rawText,
    parsedItems: args.parsedItems,
    mealType: args.mealType,
    loggedAt: new Date().toISOString(),
    estimatedNutrition: args.estimatedNutrition,
    confidence: args.confidence,
    coachTip: args.coachTip,
  };
}
