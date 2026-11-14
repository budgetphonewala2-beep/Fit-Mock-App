"use client";

import { FormEvent, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  Info,
  Leaf,
  Mic,
  Pencil,
  Plus,
  Droplets,
  RefreshCw,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { FirstMealLogged, formatStreakLabel } from "@/components/diet/first-meal-logged";
import { WaterTracker } from "@/components/ui/water-tracker";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { IconBadge } from "@/components/glass/icon-badge";
import { CELEBRATION_FIRST_MEAL, hasSeenCelebration } from "@/lib/achievements";
import {
  formatDietTimelineMealLogText,
  generateDietTimelineOptions,
  getDietTimelineSlotMeta,
  getDietTimelineMealNutrition,
  getGoalCalculationDetails,
  getGoalSummary,
  getNutritionForDate,
  getSessionForDate,
} from "@/lib/recommendations";
import { adaptDayPlan } from "@/lib/diet-day-adapter";
import { getGoalCycle } from "@/lib/goal-cycle";
import type { MealRecipeItem } from "@/lib/meal-plan-engine";
import { clamp, cn, isProTier, startOfTodayIso } from "@/lib/utils";
import { nativeBridge } from "@/lib/native-bridge";
import { renderFirstMealShareCard } from "@/lib/share-cards";
import { firstMealShareText } from "@/lib/share-text";
import { ensureMicPermission, micBlockedMessage, openMicSettings } from "@/lib/mic-permission";
import { buildVoiceTranscript } from "@/lib/voice-transcript";
import {
  CAMERA_BLOCKED_IN_APP,
  CAMERA_DISMISSED,
  CAMERA_TAP_AGAIN,
  ensureCameraPermission,
  needsSecondCameraTap,
  openCameraSettings,
} from "@/lib/camera-permission";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { parseMealText } from "@/lib/meal-parser";
import { buildMealParseResult } from "@/lib/meal-catalog";
import type { DietTimelineMeal, MealLog, MealType, ParsedMealItem, UserProfile } from "@/lib/types";

function nativeMicPermissionErrorState() {
  return nativeBridge.isNative
    ? { text: micBlockedMessage(true), onFix: openMicSettings }
    : { text: micBlockedMessage(false) };
}

function formatParsedItemLabel(item: ParsedMealItem) {
  const quantityLabel = Number.isInteger(item.quantity)
    ? String(item.quantity)
    : item.quantity.toFixed(1).replace(/\.0$/, "");

  if (item.unit === "serving") {
    return item.quantity === 1
      ? item.name
      : `${quantityLabel} servings ${item.name}`;
  }

  return `${quantityLabel} ${item.unit} ${item.name}`;
}

/* ── Speech recognition types ── */

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = { isFinal: boolean; 0: SpeechRecognitionAlternative };
type SpeechRecognitionEvent = { resultIndex: number; results: ArrayLike<SpeechRecognitionResult> };
type SpeechRecognitionErrorEvent = { error: string };
type SpeechRecognitionInstance = {
  continuous: boolean; interimResults: boolean; lang: string;
  onend: (() => void) | null; onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((e: SpeechRecognitionEvent) => void) | null; start: () => void; stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

/** Snapshot of the first saved log, so the win screen never re-reads state. */
type FirstMealCelebration = {
  logId: string;
  mealName: string;
  kcal: number;
  photoUrl?: string;
  streakDay: number;
  showMeal: boolean;
};

type PhotoMealDraft = {
  // "text" is a meal typed (or dictated) into the box and sent with Track meal.
  source: "photo" | "voice" | "text";
  previewText: string;
  originalPreviewText: string;
  // Set once the user types in the edit box. Until then the sheet's items are
  // what gets logged, so removing a row or keeping a word doesn't re-parse
  // the text and drop foods the photo analysis estimated outside the catalog.
  previewTextEdited?: boolean;
  mealType: MealType;
  parsedItems: MealLog["parsedItems"];
  estimatedNutrition: MealLog["estimatedNutrition"];
  confidence: number;
  coachTip: string;
  matchedItems: string[];
  unrecognizedSegments: string[];
};

function compressMealPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const maxDimension = 1400;
      const scale = Math.min(1, maxDimension / image.width, maxDimension / image.height);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Couldn't prepare the meal photo."));
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      URL.revokeObjectURL(objectUrl);
      resolve(dataUrl);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read the meal photo."));
    };

    image.src = objectUrl;
  });
}

function formatGoalValue(value: number, unit: string) {
  if (unit === "L") {
    return `${value.toFixed(1)}${unit}`;
  }

  if (unit === "mcg" && value < 10) {
    return `${value.toFixed(1)}${unit}`;
  }

  return `${Math.round(value * 10) / 10}${unit}`;
}

function formatMealCalories(value: number) {
  return `${Math.round(value)} kcal`;
}

function formatMealMacro(value: number, label: string) {
  const rounded = Math.round(value * 10) / 10;
  const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${display}g ${label}`;
}

function formatMealMacroGrams(value: number) {
  const rounded = Math.round(value * 10) / 10;
  const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${display}g`;
}

// Split a meal's prose quantity ("eggs 2, bread toast 3, mixed veg sabji
// (spiced vegetable curry) 120g") into individual rows. Commas inside
// parentheses stay with the item so a bracketed English translation is not
// torn in two.
function splitMealItems(quantity: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let buffer = "";
  for (const ch of quantity) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      const trimmed = buffer.trim();
      if (trimmed) items.push(trimmed);
      buffer = "";
      continue;
    }
    buffer += ch;
  }
  const tail = buffer.trim();
  if (tail) items.push(tail);
  return items;
}

// Lifts the parenthetical ("spiced vegetable curry") out of the ingredient
// line so it can render as a lighter translator caption underneath the item.
function parseMealItem(item: string): { main: string; hint: string | null } {
  const match = item.match(/^(.*?)\s*\(([^)]+)\)\s*(.*)$/);
  if (!match) {
    return { main: item.trim(), hint: null };
  }
  const before = match[1].trim();
  const paren = match[2].trim();
  const after = match[3].trim();
  const main = after ? `${before} ${after}`.replace(/\s+/g, " ").trim() : before;
  return { main, hint: paren || null };
}

// The app has no calorie-burn tracking, so estimate the day's burn from
// completed workouts: session duration × an effort-based MET × bodyweight.
const EFFORT_MET: Record<string, number> = { easy: 3.5, steady: 5, push: 6.5 };

function estimateBurnedKcal(
  workoutLogs: { sessionDate: string; completedSession: boolean; effort: string }[],
  workoutPlan: Parameters<typeof getSessionForDate>[0],
  dateIso: string,
  weightKg: number,
) {
  const session = getSessionForDate(workoutPlan, dateIso);
  const durationHours = (session?.durationMin ?? 45) / 60;

  return Math.round(
    workoutLogs
      .filter((log) => log.sessionDate === dateIso && log.completedSession)
      .reduce((sum, log) => sum + (EFFORT_MET[log.effort] ?? 5) * weightKg * durationHours, 0),
  );
}


function NutrientChip({
  current,
  label,
  target,
  unit,
  barClass,
}: {
  current: number;
  label: string;
  target: number;
  unit: string;
  barClass: string;
}) {
  const progress = target > 0 ? clamp((current / target) * 100, 0, 100) : 0;

  return (
    <div className="w-[100px] shrink-0 rounded-tile glass-inset px-3 py-2.5">
      <span className="text-[12px] font-semibold text-foreground">{label}</span>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
        <div className={cn("h-full rounded-full transition-[width] duration-500", barClass)} style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-2 text-[12px] font-semibold text-foreground">
        {formatGoalValue(current, unit).replace(unit, "")}
        <span className="font-medium text-foreground/40"> / {formatGoalValue(target, unit)}</span>
      </div>
    </div>
  );
}

function getGoalWeightLabel(profile: UserProfile) {
  const targetKg = profile.goalTargetKg ?? 0;

  if (profile.primaryGoal === "build-muscle") {
    return `${profile.weightKg + targetKg} kg target`;
  }

  if (profile.primaryGoal === "lose-weight") {
    return `${Math.max(profile.weightKg - targetKg, 0)} kg target`;
  }

  return `${profile.weightKg} kg baseline`;
}

function inferMealTypeForCurrentTime(date = new Date()): MealType {
  const hour = date.getHours();

  if (hour < 11) {
    return "breakfast";
  }

  if (hour < 16) {
    return "lunch";
  }

  if (hour < 19) {
    return "snack";
  }

  return "dinner";
}

function buildCoachTip(mealType: MealType, proteinG: number) {
  const proteinSummary =
    proteinG >= 25
      ? "Nice protein hit."
      : "Consider adding a protein anchor like dal, paneer, eggs, tofu, chicken, or curd.";

  return `${mealType[0].toUpperCase()}${mealType.slice(1)} logged. ${proteinSummary}`;
}

type PlanVsActual = {
  caloriesDelta: number;
  proteinDelta: number;
  carbsDelta: number;
  fatsDelta: number;
  actualCalories: number;
  actualProteinG: number;
  loggedCount: number;
};

// Plan slot times read "7:30 AM" / "10:30 PM"; convert to minutes past midnight.
function parsePlanTimeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]) % 12 + (/pm/i.test(match[3]) ? 12 : 0);

  return hours * 60 + Number(match[2]);
}

function getLoggedAtMinutes(log: MealLog) {
  const loggedAt = new Date(log.loggedAt);

  return Number.isNaN(loggedAt.getTime())
    ? null
    : loggedAt.getHours() * 60 + loggedAt.getMinutes();
}

// Nearest slot of the log's meal type by clock time, among slots passing `isOpen`.
// Falls back to plan order when either timestamp is unparseable.
function findNearestSlotByTime(
  plan: DietTimelineMeal[],
  log: MealLog,
  isOpen: (meal: DietTimelineMeal) => boolean,
) {
  const candidates = plan.filter((meal) => meal.mealType === log.mealType && isOpen(meal));

  if (candidates.length === 0) {
    return null;
  }

  const loggedMinutes = getLoggedAtMinutes(log);

  if (loggedMinutes === null) {
    return candidates[0];
  }

  return candidates.reduce((closest, meal) => {
    const closestMinutes = parsePlanTimeToMinutes(closest.time);
    const mealMinutes = parsePlanTimeToMinutes(meal.time);

    if (mealMinutes === null) {
      return closest;
    }

    if (closestMinutes === null) {
      return meal;
    }

    return Math.abs(mealMinutes - loggedMinutes) < Math.abs(closestMinutes - loggedMinutes)
      ? meal
      : closest;
  });
}

// A log belongs to exactly one plan slot. Matching on mealType alone double
// counts, because the plan carries three "snack" slots (morning, pre-workout,
// bedtime) -- one logged snack would otherwise be reported against all three.
function assignLogsToPlanSlots(plan: DietTimelineMeal[], selectedMeals: MealLog[]) {
  const logsByMealId = new Map<string, MealLog[]>(plan.map((meal) => [meal.id, []]));
  const claimed = new Set<string>();

  // "Mark taken" writes "<title>: <quantity>" into rawText, so plan-derived logs
  // can be traced back to the exact slot they came from.
  plan.forEach((meal) => {
    selectedMeals.forEach((log) => {
      if (claimed.has(log.id) || !log.rawText.startsWith(`${meal.title}:`)) {
        return;
      }

      claimed.add(log.id);
      logsByMealId.get(meal.id)?.push(log);
    });
  });

  // Free-text logs carry no slot, so fall back to when they were logged: a snack
  // recorded at 5:10 PM belongs to the 5:00 PM slot, not the 10:30 AM one. Each
  // log takes the nearest slot of its type that is still empty.
  selectedMeals.forEach((log) => {
    if (claimed.has(log.id)) {
      return;
    }

    const openSlot = findNearestSlotByTime(plan, log, (meal) =>
      (logsByMealId.get(meal.id)?.length ?? 0) === 0,
    );

    if (openSlot) {
      claimed.add(log.id);
      logsByMealId.get(openSlot.id)?.push(log);
    }
  });

  // Anything left over (more logs than slots of that type) joins the nearest slot
  // of its type rather than disappearing from the day's plan-vs-actual view.
  selectedMeals.forEach((log) => {
    if (claimed.has(log.id)) {
      return;
    }

    const nearestSlot = findNearestSlotByTime(plan, log, () => true);

    if (nearestSlot) {
      claimed.add(log.id);
      logsByMealId.get(nearestSlot.id)?.push(log);
    }
  });

  return logsByMealId;
}

function getPlanVsActualForMeal(meal: DietTimelineMeal, matchingLogs: MealLog[]): PlanVsActual {
  const actual = matchingLogs.reduce(
    (totals, log) => ({
      calories: totals.calories + log.estimatedNutrition.calories,
      proteinG: totals.proteinG + log.estimatedNutrition.proteinG,
      carbsG: totals.carbsG + log.estimatedNutrition.carbsG,
      fatsG: totals.fatsG + log.estimatedNutrition.fatsG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 },
  );

  return {
    caloriesDelta: actual.calories - meal.calories,
    proteinDelta: actual.proteinG - meal.proteinG,
    carbsDelta: actual.carbsG - meal.carbsG,
    fatsDelta: actual.fatsG - meal.fatsG,
    actualCalories: actual.calories,
    actualProteinG: actual.proteinG,
    loggedCount: matchingLogs.length,
  };
}

function formatDelta(value: number, unit: string) {
  const rounded = Math.round(value);

  if (rounded === 0) {
    return `On target`;
  }

  return rounded > 0 ? `+${rounded}${unit} over` : `${rounded}${unit} under`;
}

function DietTimelineMealCard({
  meal,
  completed,
  onMarkTaken,
  planVsActual,
  showPlanVsActual,
  canResuggest,
  isSuggesting,
  onResuggest,
  adjustment,
}: {
  meal: DietTimelineMeal;
  completed: boolean;
  onMarkTaken: () => void;
  planVsActual: PlanVsActual;
  showPlanVsActual: boolean;
  canResuggest: boolean;
  isSuggesting: boolean;
  onResuggest: () => void;
  adjustment: {
    calorieDelta: number;
    proteinDelta: number;
    originalCalories: number;
    originalProteinG: number;
  } | null;
}) {
  return (
    <div className="relative grid grid-cols-[54px_1fr] gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-semibold",
            completed
              ? "bg-primary-strong text-white"
              : "glass-inset text-foreground/55",
          )}
        >
          {completed ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
        </div>
        <div className="mt-2 h-full min-h-[92px] w-px bg-foreground/10 last:hidden" />
      </div>

      <div className="glass rounded-tile px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-primary">
              {meal.time}
            </p>
            <h3 className="mt-1 text-[16px] font-medium leading-tight tracking-[-0.02em] text-foreground">
              {meal.title}
            </h3>
          </div>
          <button
            type="button"
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition active:scale-[0.97]",
              completed
                ? "glass-inset text-foreground/48"
                : "border-transparent bg-primary-strong text-white shadow-[0_10px_18px_rgba(12,39,35,0.14)]",
            )}
            onClick={onMarkTaken}
            disabled={completed}
          >
            {completed ? "Taken" : "Mark taken"}
          </button>
        </div>

        <ul className="mt-3 space-y-1.5">
          {splitMealItems(meal.quantity).map((item, index) => {
            const { main, hint } = parseMealItem(item);
            return (
              <li
                key={`${meal.id}-item-${index}`}
                className="flex gap-2 text-[13px] leading-[1.35] text-foreground/78"
              >
                <span
                  aria-hidden="true"
                  className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-primary-strong/55"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{main}</span>
                  {hint ? (
                    <span className="mt-0.5 block text-[11.5px] font-medium text-foreground/48">
                      {hint}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        {/* Calories lead in the dark pill; each macro gets its own light-green
            pill with the full name so the row reads as a small labelled chart. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
          <span className="inline-flex items-center rounded-full bg-primary-strong px-2.5 py-1 text-[11px] font-semibold text-white">
            {formatMealCalories(meal.calories)}
          </span>
          <span className="inline-flex items-center rounded-full bg-primary-strong/10 px-2.5 py-1 text-[11px] font-semibold text-primary-strong">
            Protein {formatMealMacroGrams(meal.proteinG)}
          </span>
          <span className="inline-flex items-center rounded-full bg-primary-strong/10 px-2.5 py-1 text-[11px] font-semibold text-primary-strong">
            Carbs {formatMealMacroGrams(meal.carbsG)}
          </span>
          <span className="inline-flex items-center rounded-full bg-primary-strong/10 px-2.5 py-1 text-[11px] font-semibold text-primary-strong">
            Fat {formatMealMacroGrams(meal.fatsG)}
          </span>
        </div>
        {adjustment ? (
          // Shows the work: what this meal was, and that protein was held even
          // when calories came down.
          <p className="mt-2 text-[11px] leading-[1.45] text-primary">
            Adjusted from {Math.round(adjustment.originalCalories)} kcal ·{" "}
            {Math.round(adjustment.originalProteinG)}g protein
            {adjustment.calorieDelta < 0 && adjustment.proteinDelta >= 0
              ? " (carbs trimmed, protein kept)"
              : ""}
          </p>
        ) : null}
        {canResuggest ? (
          <button
            type="button"
            onClick={onResuggest}
            disabled={isSuggesting}
            className="glass-inset mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-primary transition active:scale-[0.97] disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isSuggesting && "animate-spin")} />
            {isSuggesting ? "Finding a meal..." : "Suggest another"}
          </button>
        ) : null}
        {showPlanVsActual && planVsActual.loggedCount > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-chip bg-primary/8 px-3 py-2 text-[11px] font-semibold text-primary">
            <span>You logged {Math.round(planVsActual.actualCalories)} kcal</span>
            <span>{formatDelta(planVsActual.caloriesDelta, " kcal")}</span>
            <span>{formatDelta(planVsActual.proteinDelta, "g protein")}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Food keywords and their icons. The icon shown is the keyword that appears
// earliest in the meal's own name, so the dish wins over its sides:
// "Besan chilla plate: besan, sabji, curd" reads as a pancake, not milk.
const MEAL_ICON_KEYWORDS: { pattern: RegExp; icon: string }[] = [
  { pattern: /\b(chilla|cheela|pancakes?|dosa|uttapam|besan)\b/, icon: "🥞" },
  { pattern: /\bsalads?\b/, icon: "🥗" },
  { pattern: /\b(biryani|pulao|khichdi|curry|sabji|sabzi|sambar|korma)\b/, icon: "🍛" },
  { pattern: /\b(chickpeas?|chana|rajma|beans?|dal|lentils?)\b/, icon: "🫘" },
  { pattern: /\b(sprouts?)\b/, icon: "🌱" },
  { pattern: /\bpaneer\b/, icon: "🧀" },
  { pattern: /\btofu\b/, icon: "🍱" },
  { pattern: /\b(oats|oatmeal|upma|poha|porridge|muesli|granola|cereal)\b/, icon: "🥣" },
  { pattern: /\b(eggs?|omelettes?|omelets?|bhurji)\b/, icon: "🥚" },
  { pattern: /\b(chicken|tikka)\b/, icon: "🍗" },
  { pattern: /\b(mutton|lamb|keema)\b/, icon: "🍖" },
  { pattern: /\b(prawns?|shrimps?)\b/, icon: "🍤" },
  { pattern: /\bfish\b/, icon: "🐟" },
  { pattern: /\b(idli|rice)\b/, icon: "🍚" },
  { pattern: /\b(roti|chapati|paratha|naan|phulka)\b/, icon: "🫓" },
  { pattern: /\b(toast|bread)\b/, icon: "🍞" },
  { pattern: /\bsandwich(es)?\b/, icon: "🥪" },
  { pattern: /\b(wraps?|rolls?|frankie)\b/, icon: "🌯" },
  { pattern: /\b(pasta|spaghetti)\b/, icon: "🍝" },
  { pattern: /\b(noodles|ramen)\b/, icon: "🍜" },
  { pattern: /\bpizza\b/, icon: "🍕" },
  { pattern: /\bburgers?\b/, icon: "🍔" },
  { pattern: /\b(soup|stew)\b/, icon: "🍲" },
  { pattern: /\b(smoothie|shake|whey|juice|lassi)\b/, icon: "🥤" },
  { pattern: /\b(coffee|latte|espresso)\b/, icon: "☕" },
  { pattern: /\b(tea|chai)\b/, icon: "🍵" },
  { pattern: /\b(milk|dahi|curd|yogh?urt|raita)\b/, icon: "🥛" },
  { pattern: /\b(nuts|almonds?|peanuts?|cashews?|walnuts?)\b/, icon: "🥜" },
  { pattern: /\bbananas?\b/, icon: "🍌" },
  { pattern: /\bapples?\b/, icon: "🍎" },
  { pattern: /\bmangoe?s?\b/, icon: "🥭" },
  { pattern: /\boranges?\b/, icon: "🍊" },
  { pattern: /\bgrapes?\b/, icon: "🍇" },
  { pattern: /\bwatermelon\b/, icon: "🍉" },
  { pattern: /\b(berries|strawberr(y|ies)|blueberr(y|ies))\b/, icon: "🍓" },
];

function findEarliestMealIcon(text: string) {
  let best: { index: number; icon: string } | null = null;
  for (const { pattern, icon } of MEAL_ICON_KEYWORDS) {
    const match = pattern.exec(text);
    if (match && (best === null || match.index < best.index)) {
      best = { index: match.index, icon };
    }
  }
  return best?.icon ?? null;
}

function getRepeatMealAccent(log: MealLog) {
  // The name the user typed first; the parsed ingredient names as a fallback.
  const icon =
    findEarliestMealIcon(log.rawText.toLowerCase()) ??
    findEarliestMealIcon(log.parsedItems.map((item) => item.name).join(", ").toLowerCase());
  if (icon) return { icon };

  if (log.mealType === "breakfast") return { icon: "🥣" };
  if (log.mealType === "snack") return { icon: "🥜" };
  if (log.mealType === "dinner") return { icon: "🍲" };

  return { icon: "🍽️" };
}

/* ── Main page ── */

export default function DietPage() {
  const {
    state,
    hydrated,
    logMeal,
    adjustWaterIntake,
    startNextGoalCycle,
    currentCelebration,
    enqueueCelebration,
    dismissCelebration,
  } = useDietFit();
  const router = useRouter();
  const todayIso = startOfTodayIso();
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [rawMeal, setRawMeal] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [view, setView] = useState<"tracking" | "plan">("tracking");
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const [isAddingMeal, setIsAddingMeal] = useState(false);
  const [mealVariantIndexById, setMealVariantIndexById] = useState<Record<string, number>>({});
  // Extra options fetched from the AI endpoint, already priced and verified
  // server-side. Kept per slot alongside the curated variants.
  const [aiVariantsBySlot, setAiVariantsBySlot] = useState<
    Record<string, { meal: DietTimelineMeal; items: MealRecipeItem[] }[]>
  >({});
  const [suggestingSlotId, setSuggestingSlotId] = useState<string | null>(null);
  // Lets the user see the plan they woke up to, before today's logging.
  const [showOriginalPlan, setShowOriginalPlan] = useState(false);
  const [goalInfoOpen, setGoalInfoOpen] = useState(false);
  const [repeatMealDraft, setRepeatMealDraft] = useState<MealLog | null>(null);
  const [repeatMealSlideValue, setRepeatMealSlideValue] = useState(0);
  const [repeatMealDragging, setRepeatMealDragging] = useState(false);
  const [repeatMealAddedNoticeOpen, setRepeatMealAddedNoticeOpen] = useState(false);
  const [photoMealDraft, setPhotoMealDraft] = useState<PhotoMealDraft | null>(null);
  const [isPhotoMealEditing, setIsPhotoMealEditing] = useState(false);
  const [isPhotoAnalyzing, setIsPhotoAnalyzing] = useState(false);
  // The hint shown (and editable) in the photo confirm sheet, and the one the
  // current result was analyzed with, so "Re-analyze" only shows once it changes.
  const [photoHint, setPhotoHint] = useState("");
  const [analyzedPhotoHint, setAnalyzedPhotoHint] = useState("");
  const [isVoiceAnalyzing, setIsVoiceAnalyzing] = useState(false);
  // What the mic heard, editable at the top of the confirm sheet so a misheard
  // word can be fixed and re-analyzed before the meal is added.
  const [heardText, setHeardText] = useState("");
  const [photoMealError, setPhotoMealError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceTranscriptRef = useRef("");
  // Safari ends a session on every pause and when the screen dims; track intent so
  // those stops resume instead of ending (and prematurely submitting) the meal.
  const { isOpen: keyboardIsOpen } = useKeyboardInset();
  const voiceShouldListenRef = useRef(false);
  // Set when Track meal takes over mid-dictation: the box's text is analyzed
  // instead, so the mic's own late results and end-of-speech analysis are
  // dropped rather than opening a second confirm sheet.
  const voiceHandedOffRef = useRef(false);
  const voiceFinalRef = useRef("");
  const [voiceError, setVoiceError] = useState<
    { text: string; onFix?: () => void } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraNote, setCameraNote] = useState<
    { text: string; onFix?: () => void } | null
  >(null);
  const repeatMealSliderRef = useRef<HTMLDivElement>(null);
  const repeatMealPointerIdRef = useRef<number | null>(null);
  const repeatMealCloseTimeoutRef = useRef<number | null>(null);
  // The first-ever meal log earns a full-screen win. It is armed before the
  // save starts and only fires on the log that lands, so a restored state or a
  // second meal can never replay it.
  const [firstMealCelebration, setFirstMealCelebration] =
    useState<FirstMealCelebration | null>(null);
  const [highlightedMealId, setHighlightedMealId] = useState<string | null>(null);
  const awaitingFirstMealRef = useRef(false);
  const firstMealPhotoRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (repeatMealCloseTimeoutRef.current !== null) {
        window.clearTimeout(repeatMealCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!awaitingFirstMealRef.current) {
      return;
    }

    const log = state.mealLogs[0];

    if (!log) {
      return;
    }

    awaitingFirstMealRef.current = false;

    const mealName = log.rawText.trim();
    const kcal = Math.round(log.estimatedNutrition.calories);

    setFirstMealCelebration({
      logId: log.id,
      mealName,
      kcal,
      photoUrl: firstMealPhotoRef.current ?? undefined,
      streakDay: Math.max(state.streak, 1),
      // Nothing beats zeroes or a half-parsed guess on a celebration screen.
      showMeal: mealName.length > 0 && kcal > 0 && log.confidence >= 0.5,
    });
    firstMealPhotoRef.current = null;
    // The payload stays local; the queue only decides when this gets the
    // screen, so it cannot land on top of a milestone unlocked by the same log.
    enqueueCelebration(CELEBRATION_FIRST_MEAL);
  }, [state.mealLogs, state.streak, enqueueCelebration]);

  // Dismissing lands back on the day's log with the new meal called out.
  useEffect(() => {
    if (!highlightedMealId) {
      return;
    }

    document
      .getElementById(`meal-log-${highlightedMealId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });

    const timer = window.setTimeout(() => setHighlightedMealId(null), 2600);
    return () => window.clearTimeout(timer);
  }, [highlightedMealId]);

  useEffect(() => { setSelectedDate(todayIso); }, [todayIso]);

  useEffect(() => {
    const el = document.getElementById(`diet-date-${selectedDate}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    // Re-runs when the history strip opens so today is in view, not 13 days ago.
  }, [selectedDate, showHistoryPicker]);

  if (!hydrated) {
    return (
      <div className="min-h-screen px-4 pt-8">
        <div className="rounded-hero border border-white/50 bg-white/40 p-6 text-center text-foreground/50 backdrop-blur-xl">
          Loading nutrition dashboard...
        </div>
      </div>
    );
  }

  if (!state.onboardingCompleted || !state.nutritionTargets || !state.profile) {
    return (
      <div className="min-h-screen px-4 pt-8">
        <div className="rounded-hero border border-white/50 bg-white/40 p-6 text-center text-foreground/50 backdrop-blur-xl">
          Complete onboarding to unlock your meal tracker.
        </div>
      </div>
    );
  }

  const targets = state.nutritionTargets;
  const dateOptions = Array.from({ length: 14 }, (_, i) => addDays(parseISO(todayIso), i - 13));
  const selectedNutrition = getNutritionForDate(state.mealLogs, selectedDate);
  const selectedMeals = state.mealLogs.filter((m) => m.loggedAt.startsWith(selectedDate));
  const isToday = selectedDate === todayIso;
  const goalSummary = getGoalSummary(state.profile);
  const goalDetails = getGoalCalculationDetails(state.profile);
  const timelinePosition = getGoalCycle(state.profile, selectedDate);
  const dietTimelineOptions = generateDietTimelineOptions(state.profile, targets);
  const dietTimelinePlan = dietTimelineOptions.map((slot) => slot.options[0].meal);
  const dietTimelineSlotMeta = getDietTimelineSlotMeta(state.profile);

  // ── Today's plan, adapted to what has actually been eaten ──
  // A slot counts as taken once it has been logged from the plan; its text is
  // written as "<title>: <ingredients>" by handleMarkPlannedMeal.
  const takenSlotTitles = new Set(
    selectedMeals
      .map((log) => log.rawText.split(":")[0]?.trim().toLowerCase())
      .filter(Boolean),
  );
  const chosenBySlot = dietTimelineOptions.map((slot) => {
    const options = [...slot.options, ...(aiVariantsBySlot[slot.id] ?? [])];
    const index = (mealVariantIndexById[slot.id] ?? 0) % options.length;

    return { slot, options, index, chosen: options[index] };
  });
  const dayAdaptation = adaptDayPlan({
    slots: chosenBySlot.map(({ slot, chosen }) => ({
      id: slot.id,
      time: slot.time,
      calorieShare: slot.calorieShare,
      meal: chosen.meal,
      items: chosen.items,
      taken: takenSlotTitles.has(chosen.meal.title.toLowerCase()),
    })),
    targetCalories: targets.calories,
    consumedCalories: selectedNutrition.calories,
  });
  const adaptationBySlot = new Map(dayAdaptation.slots.map((slot) => [slot.slotId, slot]));
  const isPro = isProTier(state.subscriptionTier);
  const logsByPlanSlot = assignLogsToPlanSlots(dietTimelinePlan, selectedMeals);
  const planVsActualByMealId = new Map(
    dietTimelinePlan.map((meal) => [
      meal.id,
      getPlanVsActualForMeal(meal, logsByPlanSlot.get(meal.id) ?? []),
    ]),
  );
  const micros = targets.micros;
  const waterTargetMl = Math.round(micros.waterL * 1000);
  const todayWaterMl = state.waterLogs.find((log) => log.date === selectedDate)?.amountMl ?? 0;
  const nutrientGoals = [
    { label: "Calories", current: selectedNutrition.calories, target: targets.calories, unit: "kcal" },
    { label: "Protein", current: selectedNutrition.proteinG, target: targets.proteinG, unit: "g" },
    { label: "Carbs", current: selectedNutrition.carbsG, target: targets.carbsG, unit: "g" },
    { label: "Fats", current: selectedNutrition.fatsG, target: targets.fatsG, unit: "g" },
    { label: "Fiber", current: selectedNutrition.fiberG, target: micros.fiberG, unit: "g" },
    { label: "Water", current: todayWaterMl / 1000, target: micros.waterL, unit: "L" },
    { label: "Iron", current: selectedNutrition.micros.iron ?? 0, target: micros.ironMg, unit: "mg" },
    { label: "B12", current: selectedNutrition.micros.vitaminB12 ?? 0, target: micros.vitaminB12Mcg, unit: "mcg" },
  ];
  // ── Energy ring: eaten vs goal, remaining in the center ──
  const eatenCalories = Math.round(selectedNutrition.calories);
  const goalCalories = Math.round(targets.calories);
  const remainingCalories = Math.max(0, goalCalories - eatenCalories);
  const caloriesProgress = goalCalories > 0 ? eatenCalories / goalCalories : 0;
  const burnedCalories = estimateBurnedKcal(
    state.workoutLogs,
    state.workoutPlan,
    selectedDate,
    state.profile.weightKg,
  );
  const nutrientBarClassByLabel: Record<string, string> = {
    Protein: "bg-primary",
    Carbs: "bg-accent",
    Fats: "bg-brand",
    Fiber: "bg-forest",
    Water: "bg-[#3d9bef]",
    Iron: "bg-primary-strong",
    B12: "bg-primary",
  };
  // Calories live in the ring, so the swipeable chips cover everything else.
  const nutrientChips = nutrientGoals
    .filter((goal) => goal.label !== "Calories")
    .map((goal) => ({ ...goal, barClass: nutrientBarClassByLabel[goal.label] ?? "bg-primary" }));
  const historicalRepeatMeals = state.mealLogs.filter((meal) => !meal.loggedAt.startsWith(todayIso));
  const repeatMealSource =
    historicalRepeatMeals.length > 0 ? historicalRepeatMeals : state.mealLogs;
  const repeatMeals = repeatMealSource.reduce<MealLog[]>((uniqueMeals, meal) => {
    const duplicate = uniqueMeals.some(
      (loggedMeal) => loggedMeal.rawText.trim().toLowerCase() === meal.rawText.trim().toLowerCase(),
    );

    if (duplicate) {
      return uniqueMeals;
    }

    return [...uniqueMeals, meal];
  }, [])
    .slice(0, 8);

  /* ── Handlers ── */

  /**
   * Arms the first-meal celebration for the save that is about to run. Every
   * path into `logMeal` calls this, and it no-ops for every meal but the first.
   */
  function armFirstMealCelebration(photoUrl?: string) {
    if (
      hasSeenCelebration(state.seenCelebrations, CELEBRATION_FIRST_MEAL) ||
      state.mealLogs.length > 0
    ) {
      return;
    }

    awaitingFirstMealRef.current = true;
    firstMealPhotoRef.current = photoUrl ?? null;
  }

  async function shareFirstMeal() {
    if (!firstMealCelebration) {
      return;
    }

    const { kcal, showMeal, streakDay } = firstMealCelebration;
    // No meal name: it's the raw logged text (often long or dictated), which
    // flooded the message. The card carries the calories.
    const text = firstMealShareText(formatStreakLabel(streakDay));
    const subject = "First meal logged | Fitmonk";

    // Route through the native bridge so the Flutter shell can open the OS
    // share sheet — Android WebView doesn't implement navigator.share, so a
    // direct call there silently no-ops. Share the branded story card like
    // the other celebrations; fall through to text-only if canvas fails.
    let result: { status: string } | null = null;
    try {
      const image = await renderFirstMealShareCard({
        kcal: showMeal ? kcal : undefined,
        streakLabel: formatStreakLabel(streakDay),
        userName: state.profile?.name?.split(" ")[0],
      });
      result = await nativeBridge.device.shareImage({
        text,
        subject,
        image,
        filename: "fitmonk-first-meal",
      });
    } catch {
      result = await nativeBridge.device
        .share({ text, subject })
        .catch(() => ({ status: "unavailable" as const }));
    }

    // Only fall back to clipboard when no share UI was ever shown. If the
    // sheet opened and the user backed out, that's their choice — copying
    // silently on top of it would surprise them.
    if (result?.status === "unavailable") {
      await navigator.clipboard?.writeText(text).catch(() => null);
    }
  }

  // Idempotent: the exit timer can outlive the celebration it belongs to, and a
  // second call must not clear the highlight it just set.
  function dismissFirstMealCelebration() {
    if (!firstMealCelebration) {
      return;
    }

    setHighlightedMealId(firstMealCelebration.logId);
    setFirstMealCelebration(null);
    dismissCelebration();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (capturedPhoto) {
      void analyzeCapturedPhoto();
      return;
    }
    if (!rawMeal.trim() || isVoiceAnalyzing) return;
    const mealText = rawMeal.trim();

    // Mid-dictation, Track meal takes what's in the box: stop the mic and drop
    // its own end-of-speech analysis so only one confirm sheet opens.
    if (isListening) {
      voiceHandedOffRef.current = true;
      voiceShouldListenRef.current = false;
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    setCapturedPhoto(null);
    setPhotoMealError(null);
    // Same confirm sheet as voice: nothing is logged (or celebrated as a first
    // meal) until the user checks the ingredients and taps Add meal.
    void analyzeMealText(mealText, "text");
  }

  /**
   * Cycles through this slot's options. Once the curated ones run out we ask
   * the AI endpoint for a fresh, server-verified option and append it. If that
   * fails we simply wrap around — never show an unverified suggestion.
   */
  function handleResuggestMeal(
    slotId: string,
    variants: DietTimelineMeal[],
    variantIndex: number,
  ) {
    const nextIndex = variantIndex + 1;

    if (nextIndex < variants.length) {
      setMealVariantIndexById((current) => ({ ...current, [slotId]: nextIndex }));
      return;
    }

    const slot = dietTimelineSlotMeta.find((entry) => entry.id === slotId);

    if (!slot || suggestingSlotId) {
      setMealVariantIndexById((current) => ({ ...current, [slotId]: 0 }));
      return;
    }

    setSuggestingSlotId(slotId);

    void (async () => {
      try {
        const response = await fetch("/api/meal-plan/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotId,
            time: slot.time,
            mealType: slot.mealType,
            calorieShare: slot.calorieShare,
            dailyCalories: targets.calories,
            eatsMeat: state.profile?.foodFlags.eatsMeat ?? false,
            eatsDairy: state.profile?.foodFlags.eatsDairy ?? false,
            eatsEggs: state.profile?.foodFlags.eatsEggs ?? false,
            avoidTitles: variants.map((variant) => variant.title),
          }),
        });

        if (!response.ok) {
          throw new Error(`Suggestion failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as {
          meal?: DietTimelineMeal;
          items?: MealRecipeItem[];
        };

        if (!payload.meal || !payload.items) {
          throw new Error("Suggestion response was incomplete.");
        }

        const suggested = { meal: payload.meal, items: payload.items };

        setAiVariantsBySlot((current) => ({
          ...current,
          [slotId]: [...(current[slotId] ?? []), suggested],
        }));
        setMealVariantIndexById((current) => ({ ...current, [slotId]: nextIndex }));
      } catch (error) {
        console.error("Could not fetch an AI meal suggestion.", error);
        setMealVariantIndexById((current) => ({ ...current, [slotId]: 0 }));
      } finally {
        setSuggestingSlotId(null);
      }
    })();
  }

  function handleMarkPlannedMeal(meal: DietTimelineMeal) {
    const estimatedNutrition = getDietTimelineMealNutrition(meal);

    armFirstMealCelebration();
    logMeal(formatDietTimelineMealLogText(meal), meal.mealType, {
      parsedItems: [
        {
          name: meal.title,
          quantity: 1,
          unit: "serving",
          confidence: 1,
          nutrition: estimatedNutrition,
        },
      ],
      estimatedNutrition,
      confidence: 1,
      coachTip: buildCoachTip(meal.mealType, meal.proteinG),
    });
  }

  async function handlePhotoCapture() {
    setCameraNote(null);
    const tappedAt = Date.now();
    const { outcome, prompted } = await ensureCameraPermission();

    if (outcome === "blocked") {
      setCameraNote({ text: CAMERA_BLOCKED_IN_APP, onFix: openCameraSettings });
      return;
    }
    if (outcome === "dismissed") {
      setCameraNote({ text: CAMERA_DISMISSED });
      return;
    }
    if (needsSecondCameraTap(prompted, Date.now() - tappedAt)) {
      setCameraNote({ text: CAMERA_TAP_AGAIN });
      return;
    }
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraNote(null);
    setPhotoMealError(null);
    setPhotoMealDraft(null);

    void (async () => {
      try {
        const compressedPhoto = await compressMealPhoto(file);
        setCapturedPhoto(compressedPhoto);
        // Analyze straight away: the user already confirmed the shot in the
        // camera, so go to the confirm sheet instead of waiting for another
        // tap. The hint can still be added or changed there.
        void analyzeCapturedPhoto(compressedPhoto, rawMeal.trim());
      } catch (error) {
        console.error("Meal photo preparation failed.", error);
        setPhotoMealError("We couldn't prepare that photo. Please try another shot.");
      }
    })();

    e.target.value = "";
  }

  function resetPhotoMealDraft() {
    setPhotoMealDraft(null);
    setIsPhotoMealEditing(false);
  }

  function removePhotoDraftItem(index: number) {
    setPhotoMealDraft((current) => {
      if (!current) {
        return current;
      }

      const remainingItems = current.parsedItems.filter((_, i) => i !== index);
      const rebuilt = buildMealParseResult({
        parsedItems: remainingItems,
        unmatchedSegments: current.unrecognizedSegments,
        mealType: current.mealType,
      });
      const nextPreviewText = remainingItems.map(formatParsedItemLabel).join(", ");
      const nextMatchedItems = remainingItems.map(formatParsedItemLabel);

      return {
        ...current,
        previewText: nextPreviewText,
        parsedItems: rebuilt.parsedItems,
        estimatedNutrition: rebuilt.estimatedNutrition,
        confidence: rebuilt.confidence,
        coachTip: rebuilt.coachTip,
        matchedItems: nextMatchedItems,
      };
    });
  }

  function addUnmatchedSegment(index: number) {
    setPhotoMealDraft((current) => {
      if (!current) {
        return current;
      }

      const segment = current.unrecognizedSegments[index]?.trim();

      if (!segment) {
        return current;
      }

      const remainingUnmatched = current.unrecognizedSegments.filter(
        (_, i) => i !== index,
      );
      const nextText = current.previewText.trim()
        ? `${current.previewText.trim()}, ${segment}`
        : segment;
      // Parse only the kept word and add it to the existing rows, so foods
      // the photo analysis estimated outside the catalog stay in the draft.
      const segmentParse = parseMealText(segment, current.mealType);
      const reparsed = buildMealParseResult({
        parsedItems: [...current.parsedItems, ...segmentParse.parsedItems],
        unmatchedSegments: segmentParse.unrecognizedSegments,
        mealType: current.mealType,
      });

      // parseMealText may re-flag the segment as unrecognized; keep it out of the
      // "Also seen" list either way — the user already chose to keep it, and it
      // still lands in the raw text used at confirm time.
      const mergedUnmatched = Array.from(
        new Set([
          ...remainingUnmatched,
          ...reparsed.unrecognizedSegments.filter(
            (candidate) => candidate.trim() !== segment,
          ),
        ]),
      );

      return {
        ...current,
        previewText: nextText,
        parsedItems: reparsed.parsedItems,
        estimatedNutrition: reparsed.estimatedNutrition,
        confidence: reparsed.confidence,
        coachTip: reparsed.coachTip,
        unrecognizedSegments: mergedUnmatched,
        matchedItems: reparsed.parsedItems.map(formatParsedItemLabel),
      };
    });
  }

  function confirmPhotoMealDraft() {
    if (!photoMealDraft) {
      return;
    }

    const ingredientText = photoMealDraft.previewText.trim();

    if (!ingredientText) {
      return;
    }

    const mealType = photoMealDraft.mealType;
    const unchanged =
      !photoMealDraft.previewTextEdited ||
      ingredientText === photoMealDraft.originalPreviewText.trim();
    const directEntry = unchanged
      ? {
          parsedItems: photoMealDraft.parsedItems,
          estimatedNutrition: photoMealDraft.estimatedNutrition,
          confidence: photoMealDraft.confidence,
          coachTip: photoMealDraft.coachTip,
        }
      : undefined;

    // Grabbed before the preview is cleared: a photo-logged meal gets its own
    // shot on the celebration chip instead of the generic glyph.
    const photo = photoMealDraft.source === "photo" ? capturedPhoto ?? undefined : undefined;

    setPhotoMealDraft(null);
    setIsPhotoMealEditing(false);
    setPhotoMealError(null);
    setCapturedPhoto(null);
    setRawMeal("");
    setIsAddingMeal(true);
    armFirstMealCelebration(photo);
    void logMeal(ingredientText, mealType, directEntry).finally(() => {
      setIsAddingMeal(false);
    });
  }

  async function analyzeCapturedPhoto(
    photo: string | null = capturedPhoto,
    hint: string = rawMeal.trim(),
  ) {
    if (!photo || isPhotoAnalyzing) {
      return;
    }

    setIsPhotoAnalyzing(true);
    setPhotoMealError(null);
    setPhotoHint(hint);
    setAnalyzedPhotoHint(hint);

    try {
      const mealType = inferMealTypeForCurrentTime();
      const response = await fetch("/api/meal-photo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageDataUrl: photo,
          mealType,
          hintText: hint || undefined,
        }),
      });

      const payload = (await response.json()) as
        | {
            error?: string;
          }
        | (PhotoMealDraft & {
            source?: string;
          });

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "We couldn't understand that meal photo yet.",
        );
      }

      if (!("parsedItems" in payload) || payload.parsedItems.length === 0) {
        throw new Error("We couldn't identify the foods in that photo yet.");
      }

      const previewText = payload.previewText?.trim() || payload.matchedItems.join(", ");

      setIsPhotoMealEditing(false);
      setPhotoMealDraft({
        source: "photo",
        previewText,
        originalPreviewText: previewText,
        mealType,
        parsedItems: payload.parsedItems,
        estimatedNutrition: payload.estimatedNutrition,
        confidence: payload.confidence,
        coachTip: payload.coachTip,
        matchedItems: payload.matchedItems,
        unrecognizedSegments: payload.unrecognizedSegments,
      });
    } catch (error) {
      console.error("Meal photo analysis failed.", error);
      setPhotoMealError(
        error instanceof Error
          ? error.message
          : "We couldn't understand that meal photo yet.",
      );
    } finally {
      setIsPhotoAnalyzing(false);
    }
  }

  async function analyzeMealText(rawText: string, source: "voice" | "text") {
    const text = rawText.trim();

    if (!text) {
      return;
    }

    setHeardText(text);
    setIsVoiceAnalyzing(true);
    setPhotoMealError(null);

    const mealType = inferMealTypeForCurrentTime();

    try {
      const response = await fetch("/api/meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: text, mealType }),
      });

      if (!response.ok) {
        throw new Error(`Meal parsing failed with status ${response.status}.`);
      }

      const parsed = await response.json();

      setIsPhotoMealEditing(false);
      setPhotoMealDraft({
        source,
        previewText: text,
        originalPreviewText: text,
        mealType,
        parsedItems: parsed.parsedItems,
        estimatedNutrition: parsed.estimatedNutrition,
        confidence: parsed.confidence,
        coachTip: parsed.coachTip,
        matchedItems: [],
        unrecognizedSegments: parsed.unrecognizedSegments ?? [],
      });
    } catch (error) {
      console.error("Falling back to local meal parser for voice entry.", error);

      const parsed = parseMealText(text, mealType);

      setIsPhotoMealEditing(false);
      setPhotoMealDraft({
        source,
        previewText: text,
        originalPreviewText: text,
        mealType,
        parsedItems: parsed.parsedItems,
        estimatedNutrition: parsed.estimatedNutrition,
        confidence: parsed.confidence,
        coachTip: parsed.coachTip,
        matchedItems: [],
        unrecognizedSegments: parsed.unrecognizedSegments,
      });
    } finally {
      setIsVoiceAnalyzing(false);
      setRawMeal("");
    }
  }

  function getRecognition() {
    if (recognitionRef.current) return recognitionRef.current;
    const Api = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Api) return null;
    const r = new Api();
    // continuous keeps the session alive across natural pauses; without it Safari
    // stops at the first breath, which here also submitted a half-spoken meal.
    r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-US";
    r.onresult = (event) => {
      if (voiceHandedOffRef.current) return;
      // Rebuilt from every result each time rather than appended: Android
      // repeats and extends phrases, which appending turned into
      // "a breada bread rollfilledfilled with". voiceFinalRef holds what
      // earlier sessions heard before a restart.
      const transcript = buildVoiceTranscript(voiceFinalRef.current, event.results);
      voiceTranscriptRef.current = transcript;
      setRawMeal(transcript);
    };
    r.onerror = (event) => {
      // Permission failures are terminal; the rest are transient and onend resumes.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        voiceShouldListenRef.current = false;
        setVoiceError(nativeMicPermissionErrorState());
      }
    };
    r.onend = () => {
      // Only submit once the user actually stopped. Safari also fires onend on
      // pauses and screen dimming, and submitting there would log a partial meal.
      if (voiceShouldListenRef.current) {
        // A new session starts with an empty result list, so keep what this
        // one heard.
        voiceFinalRef.current = voiceTranscriptRef.current;
        try {
          r.start();
          return;
        } catch {
          voiceShouldListenRef.current = false;
          setVoiceError({ text: "Voice input stopped. Tap the mic to continue." });
        }
      }

      setIsListening(false);
      const transcript = voiceTranscriptRef.current;
      voiceTranscriptRef.current = "";
      voiceFinalRef.current = "";

      if (voiceHandedOffRef.current) {
        voiceHandedOffRef.current = false;
        return;
      }
      if (transcript) {
        void analyzeMealText(transcript, "voice");
      }
    };
    recognitionRef.current = r;
    return r;
  }

  async function handleVoice() {
    const r = getRecognition();
    if (!r) {
      setVoiceError({ text: "Voice input isn't supported in this browser." });
      return;
    }
    if (isListening) {
      voiceShouldListenRef.current = false;
      r.stop();
      return;
    }

    // In the native shell the WebView's SpeechRecognition can't succeed until the
    // OS-level microphone permission is granted, so request it up front. This is
    // what surfaces the platform's native mic prompt — without it we fall through
    // to a silent "not-allowed" and the user just sees a red error.
    const permission = await ensureMicPermission();
    if (permission === "blocked") {
      setVoiceError(nativeMicPermissionErrorState());
      return;
    }
    if (permission === "dismissed") {
      // User dismissed the OS prompt; leave the input quiet, no red error.
      setVoiceError(null);
      return;
    }

    voiceTranscriptRef.current = "";
    voiceFinalRef.current = "";
    voiceHandedOffRef.current = false;
    voiceShouldListenRef.current = true;
    setVoiceError(null);
    setIsListening(true);
    try { r.start(); } catch { voiceShouldListenRef.current = false; setIsListening(false); }
  }

  function resetRepeatMealPopup() {
    if (repeatMealCloseTimeoutRef.current !== null) {
      window.clearTimeout(repeatMealCloseTimeoutRef.current);
      repeatMealCloseTimeoutRef.current = null;
    }

    setRepeatMealDraft(null);
    setRepeatMealSlideValue(0);
    setRepeatMealDragging(false);
    setRepeatMealAddedNoticeOpen(false);
    repeatMealPointerIdRef.current = null;
  }

  function confirmRepeatMeal() {
    if (!repeatMealDraft) {
      return;
    }

    armFirstMealCelebration();
    logMeal(repeatMealDraft.rawText, repeatMealDraft.mealType, {
      parsedItems: repeatMealDraft.parsedItems,
      estimatedNutrition: repeatMealDraft.estimatedNutrition,
      confidence: repeatMealDraft.confidence,
      coachTip: repeatMealDraft.coachTip,
    });
    setRepeatMealAddedNoticeOpen(true);
    repeatMealCloseTimeoutRef.current = window.setTimeout(() => {
      resetRepeatMealPopup();
    }, 950);
  }

  function updateRepeatMealSlideFromClientX(clientX: number) {
    const slider = repeatMealSliderRef.current;

    if (!slider) {
      return 0;
    }

    const knobSize = 64;
    const padding = 7;
    const rect = slider.getBoundingClientRect();
    const maxTravel = Math.max(rect.width - knobSize - padding * 2, 1);
    const relativeX = clamp(clientX - rect.left - padding - knobSize / 2, 0, maxTravel);
    const nextValue = (relativeX / maxTravel) * 100;

    setRepeatMealSlideValue(nextValue);
    return nextValue;
  }

  function finishRepeatMealSlide(finalValue: number) {
    setRepeatMealDragging(false);
    repeatMealPointerIdRef.current = null;

    if (finalValue >= 92) {
      setRepeatMealSlideValue(100);
      window.setTimeout(() => {
        confirmRepeatMeal();
      }, 120);
      return;
    }

    setRepeatMealSlideValue(0);
  }

  function handleRepeatMealPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (repeatMealAddedNoticeOpen) {
      return;
    }

    event.preventDefault();
    repeatMealPointerIdRef.current = event.pointerId;
    setRepeatMealDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    updateRepeatMealSlideFromClientX(event.clientX);
  }

  function handleRepeatMealPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (repeatMealAddedNoticeOpen) {
      return;
    }

    if (repeatMealPointerIdRef.current !== event.pointerId) {
      return;
    }

    updateRepeatMealSlideFromClientX(event.clientX);
  }

  function handleRepeatMealPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (repeatMealAddedNoticeOpen) {
      return;
    }

    if (repeatMealPointerIdRef.current !== event.pointerId) {
      return;
    }

    const finalValue = updateRepeatMealSlideFromClientX(event.clientX);
    event.currentTarget.releasePointerCapture(event.pointerId);
    finishRepeatMealSlide(finalValue);
  }

  function handleRepeatMealPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (repeatMealAddedNoticeOpen) {
      return;
    }

    if (repeatMealPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    finishRepeatMealSlide(0);
  }

  /* ── Render ── */

  const addingMealOverlay = isAddingMeal ? (
    <div className="animate-backdrop-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8 backdrop-blur-sm">
      <div className="glass-sheet glass-ui flex flex-col items-center gap-4 rounded-card px-8 py-7">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-foreground/15 border-t-foreground" />
        <p className="text-[13px] font-semibold text-foreground">
          Adding this meal for tracking...
        </p>
      </div>
    </div>
  ) : null;

  return (
    <div className={cn("min-h-screen pt-0", keyboardIsOpen ? "pb-4" : "pb-28")}>
      {addingMealOverlay}
      <section className="glass-ui relative overflow-x-clip px-4 pb-5 pt-[calc(0.75rem+var(--safe-top))]">
        <GlassBackdrop />

        <div className="relative">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[30px] font-medium leading-none tracking-[-0.03em] text-foreground">
                {view === "plan" ? "Diet plan" : "Nutrition"}
              </h1>
            </div>
            <button
              type="button"
              aria-label={view === "plan" ? "Back to tracking" : "See diet plan"}
              className={cn(
                "glass flex h-11 shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-4 text-foreground transition active:scale-[0.96]",
              )}
              onClick={() => {
                if (view === "plan") {
                  setView("tracking");
                  return;
                }
                if (!isPro) {
                  router.push("/paywall?upgrade=1&feature=diet-plan&return=/diet");
                  return;
                }
                setView("plan");
                setSelectedDate(todayIso);
                setShowHistoryPicker(false);
              }}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-white",
                  view === "plan" ? "bg-primary" : "bg-primary-strong",
                )}
              >
                {view === "plan" ? (
                  <X className="h-[18px] w-[18px]" />
                ) : (
                  <CalendarCheck className="h-[18px] w-[18px]" />
                )}
              </span>
              <span className="text-[14px] font-semibold tracking-[-0.01em]">
                {view === "plan" ? "Close" : "Plan"}
              </span>
            </button>
          </div>


          {view === "plan" && (
            <>
              <div className="glass-dark mt-4 rounded-hero px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <IconBadge tone="dark">
                      <Target className="h-4 w-4" />
                    </IconBadge>
                    <h2 className="pt-1 text-[19px] font-medium leading-[1.2] tracking-[-0.02em]">
                      {goalSummary.headline}
                    </h2>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border border-white/28 px-2.5 py-1 text-[11px] font-semibold",
                      timelinePosition.isComplete ? "text-white" : "text-white/70",
                    )}
                  >
                    {timelinePosition.isComplete
                      ? "Plan complete"
                      : `Day ${timelinePosition.dayNumber} of ${timelinePosition.totalDays}`}
                  </span>
                </div>

                {!timelinePosition.isComplete ? (
                  <div className="mt-4 flex items-center gap-3">
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/16">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500"
                        style={{ width: `${Math.round((timelinePosition.dayNumber / timelinePosition.totalDays) * 100)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-white/70">
                      {Math.round((timelinePosition.dayNumber / timelinePosition.totalDays) * 100)}%
                    </span>
                  </div>
                ) : null}

                {/* The plan keeps serving meals past its end date, so say so
                    plainly rather than showing a day counter frozen at the
                    last day and letting it read as a live plan. */}
                {timelinePosition.isComplete ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-chip bg-white/10 px-3.5 py-3">
                    <p className="text-[12.5px] leading-[1.45] text-white/70">
                      These {timelinePosition.totalDays} days finished on{" "}
                      {format(parseISO(timelinePosition.endsOn), "d MMM")}. You&apos;re
                      still on the same targets until you start a new plan.
                    </p>
                    <button
                      type="button"
                      onClick={startNextGoalCycle}
                      className="rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-primary-strong transition active:scale-[0.97]"
                    >
                      Start a new plan
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mt-6">
                <h2 className="px-1 text-[17px] font-medium tracking-[-0.01em] text-foreground">
                  What to eat today
                </h2>

                {/* The plan re-costs itself around what was actually eaten, so
                    say plainly that it changed and why — a number that moves
                    without explanation reads as a bug. */}
                {dayAdaptation.adapted ? (
                  <div
                    className={cn(
                      "glass mt-3 rounded-tile px-4 py-3",
                      dayAdaptation.cannotFullyAbsorb && "border-accent/35",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                          <RefreshCw className="h-3.5 w-3.5 text-primary" />
                          {showOriginalPlan ? "Showing your original plan" : dayAdaptation.headline}
                        </p>
                        <p className="mt-1 text-[11.5px] leading-[1.45] text-foreground/58">
                          {showOriginalPlan
                            ? "This is what today looked like before you logged anything."
                            : dayAdaptation.detail}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="glass-inset shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold text-primary transition active:scale-[0.97]"
                        onClick={() => setShowOriginalPlan((current) => !current)}
                      >
                        {showOriginalPlan ? "Show adjusted" : "See original"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 grid gap-3">
                  {chosenBySlot.map(({ slot, options, index, chosen }) => {
                    const adapted = adaptationBySlot.get(slot.id);
                    // Show the adapted meal unless the user asked to see the
                    // plan they woke up to.
                    const meal = showOriginalPlan ? chosen.meal : adapted?.meal ?? chosen.meal;
                    const planVsActual = planVsActualByMealId.get(slot.id)!;
                    // Taken is matched on the meal actually logged from this
                    // slot, not on meal type: breakfast/lunch/dinner map to one
                    // slot each, but three slots are snacks, so an off-plan
                    // snack would otherwise mark all of them as eaten.
                    const completed = adapted?.taken ?? false;

                    return (
                      <DietTimelineMealCard
                        key={slot.id}
                        meal={meal}
                        completed={completed}
                        onMarkTaken={() => handleMarkPlannedMeal(meal)}
                        planVsActual={planVsActual}
                        showPlanVsActual={isPro}
                        canResuggest={!completed}
                        isSuggesting={suggestingSlotId === slot.id}
                        onResuggest={() =>
                          handleResuggestMeal(
                            slot.id,
                            options.map((option) => option.meal),
                            index,
                          )
                        }
                        adjustment={
                          !showOriginalPlan && adapted?.changed
                            ? {
                                calorieDelta: adapted.calorieDelta,
                                proteinDelta: adapted.proteinDelta,
                                originalCalories: adapted.original.calories,
                                originalProteinG: adapted.original.proteinG,
                              }
                            : null
                        }
                      />
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── Energy (dark calorie card) + nutrient chips (tracking view only) ── */}
          {view === "tracking" && (
            <>
              <div className="glass-dark mt-4 rounded-hero px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <IconBadge tone="dark">
                      <Flame className="h-4 w-4" />
                    </IconBadge>
                    <span className="text-[12px] font-medium text-white/75">
                      {isToday ? "Remaining" : format(parseISO(selectedDate), "MMM d")}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label="See how your goal is calculated"
                    className="inline-flex items-center gap-1 rounded-full border border-white/28 px-2.5 py-1 text-[11px] font-semibold text-white/70 transition hover:text-white"
                    onClick={() => setGoalInfoOpen(true)}
                  >
                    {isToday ? "Today's Goal" : "Goal"} {goalCalories.toLocaleString()} kcal
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div>
                      <span className="text-[44px] font-light leading-none tracking-[-0.04em]">
                        {remainingCalories.toLocaleString()}
                      </span>
                      <span className="text-[13px] font-medium text-white/60"> kcal left</span>
                    </div>
                    <div className="mt-1.5 text-[12px] font-medium text-white/55">
                      of {goalCalories.toLocaleString()} kcal
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] font-semibold text-white/65">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                        {eatenCalories.toLocaleString()} eaten
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        {burnedCalories.toLocaleString()} burned
                      </span>
                    </div>
                  </div>
                  <div className="relative h-[68px] w-[68px] shrink-0">
                    <svg viewBox="0 0 92 92" className="h-full w-full -rotate-90">
                      <circle cx="46" cy="46" r="40" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="9" />
                      <circle
                        cx="46"
                        cy="46"
                        r="40"
                        fill="none"
                        stroke="#37c9a6"
                        strokeWidth="9"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 40}
                        strokeDashoffset={2 * Math.PI * 40 * (1 - clamp(caloriesProgress, 0, 1))}
                        className="transition-[stroke-dashoffset] duration-700 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[12px] font-semibold text-white/75">
                        {Math.round(clamp(caloriesProgress, 0, 1) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass mt-3 rounded-hero px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/45">
                    Nutrients
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/35">
                    Swipe
                    <ChevronRight className="h-3 w-3" />
                  </span>
                </div>

                <div className="mt-3 flex gap-2.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {nutrientChips.map((chip) => (
                    <NutrientChip
                      key={chip.label}
                      current={chip.current}
                      label={chip.label}
                      target={chip.target}
                      unit={chip.unit}
                      barClass={chip.barClass}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Meal input (only for today view) ── */}
          {isToday && view === "tracking" && (
            <div className="mt-3 rounded-hero glass px-3 py-3">
              {/* Photo preview */}
              {capturedPhoto && (
                <div className="relative">
                  <img
                    src={capturedPhoto}
                    alt="Meal photo"
                    className="h-32 w-full rounded-chip border border-black/6 object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-[10px] text-white"
                    onClick={() => {
                      setCapturedPhoto(null);
                      setPhotoMealDraft(null);
                      setPhotoMealError(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}

              <form className={capturedPhoto ? "mt-3" : ""} onSubmit={handleSubmit}>
                {capturedPhoto ? (
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/48">
                    Hint · helps detection
                  </p>
                ) : null}
                <div className="flex items-start gap-2.5 rounded-tile glass-inset px-3.5 py-3 transition focus-within:border-brand/45">
                  <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <textarea
                    className="min-h-[24px] w-full resize-none bg-transparent text-[14px] leading-5 text-foreground/80 outline-none placeholder:text-foreground/35"
                    rows={1}
                    placeholder={
                      capturedPhoto
                        ? "Add a hint (optional), e.g. paneer bhurji + 2 roti"
                        : "Type your meal to unlock its nutrients"
                    }
                    value={rawMeal}
                    onChange={(e) => setRawMeal(e.target.value)}
                  />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="submit"
                    className={cn(
                      "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-3 text-[14px] font-semibold text-white shadow-[0_12px_24px_rgba(242,132,58,0.32)] transition active:scale-[0.98]",
                      isPhotoAnalyzing ? "opacity-70" : "",
                    )}
                    disabled={isPhotoAnalyzing || isVoiceAnalyzing}
                  >
                    {capturedPhoto ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {capturedPhoto
                      ? isPhotoAnalyzing
                        ? "Analyzing..."
                        : "Analyze meal photo"
                      : "Track meal"}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition active:scale-[0.97]",
                      isListening
                        ? "border-accent bg-accent text-white animate-pulse"
                        : isVoiceAnalyzing
                          ? "border-transparent bg-accent text-white opacity-70"
                          : "border-transparent bg-accent text-white shadow-[0_10px_20px_rgba(242,132,58,0.28)] hover:brightness-[1.03]",
                    )}
                    onClick={handleVoice}
                    disabled={isVoiceAnalyzing}
                  >
                    {isVoiceAnalyzing ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-transparent bg-accent text-white shadow-[0_10px_20px_rgba(242,132,58,0.28)] transition hover:brightness-[1.03] active:scale-[0.97]"
                    onClick={() => void handlePhotoCapture()}
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                {voiceError ? (
                  voiceError.onFix ? (
                    <button
                      type="button"
                      onClick={voiceError.onFix}
                      className="mt-2 block text-left text-[11px] font-medium leading-4 text-accent underline underline-offset-2"
                    >
                      {voiceError.text}
                    </button>
                  ) : (
                    <p className="mt-2 text-[11px] font-medium leading-4 text-accent">
                      {voiceError.text}
                    </p>
                  )
                ) : isListening ? (
                  <p className="mt-2 text-[11px] leading-4 text-foreground/45">
                    Listening... tap the mic again to stop.
                  </p>
                ) : isVoiceAnalyzing ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-4 text-foreground/45">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/50" />
                    Working out the ingredients...
                  </p>
                ) : capturedPhoto && !photoMealError ? (
                  <p className="mt-2 text-[11px] leading-4 text-foreground/45">
                    If the plate is busy, add a hint above to help detection. Otherwise tap Analyze.
                  </p>
                ) : null}
                {cameraNote ? (
                  cameraNote.onFix ? (
                    <button
                      type="button"
                      onClick={cameraNote.onFix}
                      className="mt-2 block text-left text-[11px] font-medium leading-4 text-accent underline underline-offset-2"
                    >
                      {cameraNote.text}
                    </button>
                  ) : (
                    <p className="mt-2 text-[11px] font-medium leading-4 text-accent">
                      {cameraNote.text}
                    </p>
                  )
                ) : null}
                {photoMealError ? (
                  <p className="mt-2 text-[11px] leading-4 text-accent">
                    {photoMealError}
                  </p>
                ) : null}
              </form>
            </div>
          )}

          {isToday && view === "tracking" && (
            <>
              <div className="mt-6">
                <div className="flex items-end justify-between gap-3 px-1">
                  <div>
                    <h2 className="text-[17px] font-medium tracking-[-0.01em] text-foreground">
                      Repeat meal
                    </h2>
                  </div>
                </div>

                {repeatMeals.length === 0 ? (
                  <div className="mt-3 rounded-card glass px-4 py-4 text-[12px] text-foreground/50">
                    Your recent meals will appear here once you start logging them.
                  </div>
                ) : (
                  <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {repeatMeals.map((meal) => {
                      const accent = getRepeatMealAccent(meal);

                      return (
                        <button
                          key={`repeat-${meal.id}`}
                          type="button"
                          className="group flex h-[120px] w-[160px] shrink-0 flex-col justify-between rounded-hero glass px-3 py-3 text-left transition active:scale-[0.98]"
                          onClick={() => {
                            setRepeatMealDraft(meal);
                            setRepeatMealSlideValue(0);
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-brand/16 text-[22px]">
                              <span aria-hidden="true">{accent.icon}</span>
                            </div>
                            <div className="min-w-0 flex-1 pt-1">
                              <p className="text-[12px] font-normal text-foreground/60">
                                {formatMealCalories(meal.estimatedNutrition.calories)}
                              </p>
                              <p className="mt-0.5 text-[11px] text-foreground/40">
                                {format(new Date(meal.loggedAt), "M/d/yyyy")}
                              </p>
                            </div>
                          </div>
                          <p className="line-clamp-2 text-[14px] font-normal leading-[1.2] text-foreground">
                            {meal.rawText}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-3 px-1">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#3d9bef]/18 text-[#2c7fc4]">
                    <Droplets className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-[17px] font-medium tracking-[-0.01em] text-foreground">
                      Water tracker
                    </h2>
                    <p className="mt-0.5 text-[12px] text-foreground/42">
                      Track your daily water intake.
                    </p>
                  </div>
                </div>

                <WaterTracker
                  currentMl={todayWaterMl}
                  targetMl={waterTargetMl}
                  stepMl={250}
                  compact
                  showQuickAddChips={false}
                  onAdd={(ml) => adjustWaterIntake(ml)}
                  onRemove={(ml) => adjustWaterIntake(-ml)}
                />
              </div>
            </>
          )}

          {/* ── Logged meals for selected date ── */}
          <div className="mt-4">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground/42">
                {isToday && !showHistoryPicker ? "Today's meals" : `Meals · ${format(parseISO(selectedDate), "MMM d")}`}
              </p>
              <button
                type="button"
                aria-label={showHistoryPicker ? "Close meal history" : "View meal history"}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border transition active:scale-[0.95]",
                  showHistoryPicker
                    ? "border-foreground bg-primary-strong text-white"
                    : "glass text-foreground/55 hover:text-foreground/80",
                )}
                onClick={() => {
                  setShowHistoryPicker((v) => !v);
                  if (!showHistoryPicker) {
                    setSelectedDate(todayIso);
                  } else {
                    setSelectedDate(todayIso);
                  }
                }}
              >
                <CalendarDays className="h-3.5 w-3.5" />
              </button>
            </div>

            {showHistoryPicker && (
              <div className="mt-2 rounded-card glass px-2.5 py-2.5">
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {dateOptions.map((date) => {
                    const iso = format(date, "yyyy-MM-dd");
                    const isSelected = iso === selectedDate;
                    const hasMeals = state.mealLogs.some((m) => m.loggedAt.startsWith(iso));
                    return (
                      <button
                        key={iso}
                        id={`diet-date-${iso}`}
                        type="button"
                        className={cn(
                          "min-w-[48px] shrink-0 rounded-chip border px-2 py-1.5 text-center transition active:scale-[0.98]",
                          isSelected
                            ? "border-transparent bg-primary-strong text-white shadow-[0_12px_22px_rgba(12,39,35,0.18)]"
                            : "border-transparent bg-white/40 text-foreground/68 hover:bg-white/70",
                        )}
                        onClick={() => setSelectedDate(iso)}
                      >
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-current/62">
                          {format(date, "EEEEE")}
                        </div>
                        <div className="mt-1 text-[17px] font-semibold leading-none">
                          {format(date, "d")}
                        </div>
                        <div className="mt-1 flex justify-center">
                          <span className={cn(
                            "h-2 w-2 rounded-full border border-current/10",
                            hasMeals ? "bg-current" : "bg-transparent",
                          )} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {selectedMeals.length === 0 ? (
              <div className="mt-2 rounded-card glass px-4 py-4 text-center text-[12px] text-foreground/50">
                {isToday ? "No meals logged yet today. Start tracking above!" : "No meals logged on this day."}
              </div>
            ) : (
              <div className="mt-2 grid gap-2">
                {selectedMeals.map((meal, index) => (
                  <div
                    key={meal.id}
                    id={`meal-log-${meal.id}`}
                    className={cn(
                      "glass rounded-card px-4 py-3 transition-[border-color,box-shadow] duration-500",
                      highlightedMealId === meal.id
                        ? // `!` so the highlight beats the glass utility's own border and shadow.
                          "border-brand! shadow-[0_8px_24px_rgba(55,201,166,0.35)]!"
                        : null,
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-foreground/8 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
                        Meal {selectedMeals.length - index}
                      </span>
                      <span className="text-[10px] font-semibold text-foreground/35">
                        {format(new Date(meal.loggedAt), "h:mm a")}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] font-semibold leading-snug text-foreground">
                      {meal.rawText}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-foreground/50">
                      <span>{formatMealCalories(meal.estimatedNutrition.calories)}</span>
                      <span>{formatMealMacro(meal.estimatedNutrition.proteinG, "protein")}</span>
                      <span>{formatMealMacro(meal.estimatedNutrition.carbsG, "carbs")}</span>
                      <span>{formatMealMacro(meal.estimatedNutrition.fatsG, "fats")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </section>

      {goalInfoOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          onClick={() => setGoalInfoOpen(false)}
        >
          <div
            className="glass-sheet glass-ui w-full max-w-sm rounded-hero p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-foreground/55">
                  How your goals are calculated
                </p>
                <h3 className="mt-1 text-[19px] font-medium tracking-[-0.02em] text-foreground">
                  Your daily targets, explained
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close goal explanation"
                className="glass-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/58 transition active:scale-[0.95]"
                onClick={() => setGoalInfoOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-[12px] leading-5 text-foreground/70">
              Your calorie target is built from your age, sex, height, weight, and activity level. We then shift it up or down based on your goal: a deficit for fat loss, a small surplus for muscle gain, or steady for maintenance.
            </p>

            <p className="mt-3 text-[12px] leading-5 text-foreground/70">
              Protein is set first to protect muscle. Fats are kept at a healthy baseline, and carbs fill whatever calories remain.
            </p>

            {goalDetails.paceKgPerWeek !== null && goalDetails.durationMonths !== null ? (
              <p className="mt-3 text-[12px] leading-5 text-foreground/70">
                At your current pace of ~{goalDetails.paceKgPerWeek} kg/week, you&apos;re on track to hit your goal in {goalDetails.durationMonths < 1 ? `${Math.round(goalDetails.durationMonths * 4.33)} weeks` : `${Math.round(goalDetails.durationMonths)} ${Math.round(goalDetails.durationMonths) === 1 ? "month" : "months"}`}.
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="glass-inset rounded-[18px] px-2 py-3 text-center">
                <p className="text-[15px] font-semibold text-foreground">{targets.meta.tdeeCalories}</p>
                <p className="mt-0.5 text-[10px] font-medium text-foreground/50">kcal maintenance</p>
              </div>
              <div className="glass-inset rounded-[18px] px-2 py-3 text-center">
                <p className="text-[15px] font-semibold text-foreground">{targets.meta.proteinGPerKg} g/kg</p>
                <p className="mt-0.5 text-[10px] font-medium text-foreground/50">protein target</p>
              </div>
              <div className="glass-inset rounded-[18px] px-2 py-3 text-center">
                <p className="text-[15px] font-semibold text-foreground">{targets.meta.fatPercentOfCalories}%</p>
                <p className="mt-0.5 text-[10px] font-medium text-foreground/50">calories from fat</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {photoMealDraft && (
        <div
          className="animate-backdrop-fade fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 pb-6 backdrop-blur-sm sm:items-center sm:pb-0"
          onClick={resetPhotoMealDraft}
        >
          <div
            className="animate-sheet-up glass-sheet glass-ui w-full max-w-sm rounded-hero p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[19px] font-medium tracking-[-0.02em] text-foreground">
                  {photoMealDraft.source === "photo" ? "Confirm detected meal" : "Confirm your meal"}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close meal confirmation"
                className="glass-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/58 transition active:scale-[0.95]"
                onClick={resetPhotoMealDraft}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {photoMealDraft.source !== "photo" ? (
              <div className="glass-inset mt-4 rounded-card px-4 py-3">
                <label
                  htmlFor="voice-heard-text"
                  className="text-[12px] font-medium text-foreground/55"
                >
                  {photoMealDraft.source === "voice" ? "We heard" : "Your meal"}
                </label>
                <textarea
                  id="voice-heard-text"
                  value={heardText}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-chip border border-foreground/10 bg-white px-3 py-2 text-[14px] font-medium leading-5 text-foreground outline-none transition focus:border-primary/40"
                  onChange={(event) => setHeardText(event.target.value)}
                />
                {heardText.trim() &&
                heardText.trim() !== photoMealDraft.originalPreviewText.trim() ? (
                  <button
                    type="button"
                    disabled={isVoiceAnalyzing}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-strong px-3.5 py-1.5 text-[12px] font-semibold text-white transition active:scale-[0.97] disabled:opacity-60"
                    onClick={() =>
                      void analyzeMealText(
                        heardText,
                        photoMealDraft.source === "voice" ? "voice" : "text",
                      )
                    }
                  >
                    {isVoiceAnalyzing ? "Updating…" : "Update ingredients"}
                  </button>
                ) : (
                  <p className="mt-1.5 text-[11px] leading-4 text-foreground/45">
                    {photoMealDraft.source === "voice"
                      ? "Fix any word we got wrong, then update the ingredients."
                      : "Edit it, then update the ingredients."}
                  </p>
                )}
              </div>
            ) : (
              <div className="glass-inset mt-4 rounded-card px-4 py-3">
                <label
                  htmlFor="photo-hint-text"
                  className="text-[12px] font-medium text-foreground/55"
                >
                  Add this meal with accurate weight and ingredients
                </label>
                <textarea
                  id="photo-hint-text"
                  value={photoHint}
                  rows={1}
                  placeholder="e.g. 2 roti + aloo gobi"
                  className="mt-2 w-full resize-none rounded-chip border border-foreground/10 bg-white px-3 py-2 text-[14px] font-medium leading-5 text-foreground outline-none transition placeholder:text-foreground/35 focus:border-primary/40"
                  onChange={(event) => setPhotoHint(event.target.value)}
                />
                {photoHint.trim() !== analyzedPhotoHint ? (
                  <button
                    type="button"
                    disabled={isPhotoAnalyzing}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-strong px-3.5 py-1.5 text-[12px] font-semibold text-white transition active:scale-[0.97] disabled:opacity-60"
                    onClick={() => void analyzeCapturedPhoto(capturedPhoto, photoHint.trim())}
                  >
                    {isPhotoAnalyzing ? "Analyzing…" : "Submit"}
                  </button>
                ) : null}
                {photoMealError ? (
                  <p className="mt-2 text-[11px] leading-4 text-accent">{photoMealError}</p>
                ) : null}
              </div>
            )}

            {capturedPhoto ? (
              <img
                src={capturedPhoto}
                alt="Captured meal preview"
                className="mt-4 h-36 w-full rounded-card border border-black/6 object-cover"
              />
            ) : null}

            <div className="glass-inset mt-4 rounded-card px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-medium text-foreground/55">
                  {photoMealDraft.source === "photo" ? "Ingredients detected" : "Ingredients"}
                </p>
                <button
                  type="button"
                  aria-label={isPhotoMealEditing ? "Done editing" : "Edit ingredients"}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border transition",
                    isPhotoMealEditing
                      ? "border-transparent bg-primary-strong text-white"
                      : "border-foreground/10 bg-white text-foreground/62 hover:text-foreground/82",
                  )}
                  onClick={() =>
                    setIsPhotoMealEditing((current) => {
                      const leavingEditMode = current;

                      if (leavingEditMode && photoMealDraft) {
                        const reparsed = parseMealText(
                          photoMealDraft.previewText,
                          photoMealDraft.mealType,
                        );

                        setPhotoMealDraft((draft) =>
                          draft
                            ? {
                                ...draft,
                                parsedItems: reparsed.parsedItems,
                                estimatedNutrition: reparsed.estimatedNutrition,
                                confidence: reparsed.confidence,
                                coachTip: reparsed.coachTip,
                                unrecognizedSegments: reparsed.unrecognizedSegments,
                              }
                            : draft,
                        );
                      }

                      return !current;
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              {isPhotoMealEditing ? (
                <textarea
                  value={photoMealDraft.previewText}
                  className="mt-3 min-h-24 w-full resize-none rounded-chip border border-foreground/10 bg-white px-3 py-3 text-[15px] font-medium leading-6 text-foreground outline-none transition focus:border-primary/40"
                  placeholder="List ingredients and portions"
                  onChange={(event) =>
                    setPhotoMealDraft((current) =>
                      current
                        ? {
                            ...current,
                            previewText: event.target.value,
                            previewTextEdited: true,
                          }
                        : current,
                    )
                  }
                />
              ) : photoMealDraft.parsedItems.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {photoMealDraft.parsedItems.map((item, index) => {
                    const isLow = item.confidence < 0.6;
                    const isSolid = item.confidence >= 0.8;
                    return (
                      <li
                        key={`${item.name}-${index}`}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-chip border px-3 py-2 text-[13px] font-semibold",
                          isLow
                            ? "border-accent/35 bg-accent-soft/70 text-foreground/78"
                            : "border-foreground/7 bg-white text-foreground",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "h-1.5 w-1.5 flex-shrink-0 rounded-full",
                              isSolid
                                ? "bg-primary"
                                : isLow
                                  ? "bg-accent"
                                  : "bg-brand",
                            )}
                          />
                          <span className="truncate">{formatParsedItemLabel(item)}</span>
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-black/8 text-foreground/50 transition hover:border-black/18 hover:text-foreground/80"
                          onClick={() => removePhotoDraftItem(index)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] leading-5 text-foreground/50">
                  No items yet. Tap edit to add them, or keep a word from below.
                </p>
              )}
              {photoMealDraft.unrecognizedSegments.length > 0 ? (
                isPhotoMealEditing ? (
                  <p className="mt-3 text-[11px] leading-4 text-foreground/46">
                    Couldn&apos;t confidently identify: {photoMealDraft.unrecognizedSegments.join(", ")}
                  </p>
                ) : (
                  <div className="mt-3">
                    <p className="text-[12px] font-medium text-foreground/55">
                      Couldn&apos;t match to a food · tap to keep
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {photoMealDraft.unrecognizedSegments.map((segment, index) => (
                        <button
                          key={`${segment}-${index}`}
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-foreground/12 bg-white px-2.5 py-1 text-[11px] font-semibold text-foreground/72 transition hover:text-foreground"
                          onClick={() => addUnmatchedSegment(index)}
                        >
                          <Plus className="h-3 w-3" />
                          {segment}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              ) : null}
              {!isPhotoMealEditing ? (
                <div className="mt-3 flex gap-4 border-t border-foreground/8 pt-3 text-[12px] font-semibold text-foreground/60">
                  <span>{Math.round(photoMealDraft.estimatedNutrition.calories)} kcal</span>
                  <span>{Math.round(photoMealDraft.estimatedNutrition.proteinG)}g protein</span>
                  <span>{Math.round(photoMealDraft.estimatedNutrition.carbsG)}g carbs</span>
                  <span>{Math.round(photoMealDraft.estimatedNutrition.fatsG)}g fats</span>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="flex h-11 items-center justify-center rounded-full border border-foreground/12 bg-white text-[13.5px] font-semibold text-foreground/70 transition active:scale-[0.97]"
                onClick={() => {
                  setPhotoMealDraft(null);
                  setIsPhotoMealEditing(false);
                  setCapturedPhoto(null);
                  setPhotoMealError(null);
                }}
              >
                {photoMealDraft.source === "photo" ? "Retake" : "Discard"}
              </button>
              <button
                type="button"
                className="flex h-11 items-center justify-center rounded-full bg-primary-strong text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(12,39,35,0.22)] transition active:scale-[0.97] disabled:opacity-50"
                onClick={confirmPhotoMealDraft}
                disabled={!photoMealDraft.previewText.trim()}
              >
                Add meal
              </button>
            </div>
          </div>
        </div>
      )}

      {repeatMealDraft && (
        <div
          className="animate-backdrop-fade fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 pb-6 backdrop-blur-sm sm:items-center sm:pb-0"
          onClick={() => {
            if (!repeatMealAddedNoticeOpen) {
              resetRepeatMealPopup();
            }
          }}
        >
          <div
            className="animate-sheet-up glass-sheet glass-ui relative w-full max-w-sm rounded-hero p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={cn(
                "pointer-events-none absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary-strong px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_16px_30px_rgba(12,39,35,0.2)] transition-all duration-250",
                repeatMealAddedNoticeOpen
                  ? "translate-y-0 opacity-100"
                  : "-translate-y-2 opacity-0",
              )}
              aria-live="polite"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/12">
                <Check className="h-3.5 w-3.5" />
              </span>
              Meal added
            </div>

            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[19px] font-medium tracking-[-0.02em] text-foreground">
                  Add this meal again?
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close repeat meal popup"
                className="glass-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/58 transition active:scale-[0.95]"
                onClick={() => {
                  if (!repeatMealAddedNoticeOpen) {
                    resetRepeatMealPopup();
                  }
                }}
                disabled={repeatMealAddedNoticeOpen}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="glass-inset mt-4 rounded-card px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-foreground/8 px-2.5 py-0.5 text-[11px] font-medium capitalize text-foreground/60">
                  {repeatMealDraft.mealType}
                </span>
                <span className="text-[11px] font-semibold text-foreground/42">
                  {formatMealCalories(repeatMealDraft.estimatedNutrition.calories)}
                </span>
              </div>
              <p className="mt-3 text-[15px] font-medium leading-snug text-foreground">
                {repeatMealDraft.rawText}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-foreground/50">
                <span>{formatMealMacro(repeatMealDraft.estimatedNutrition.proteinG, "protein")}</span>
                <span>{formatMealMacro(repeatMealDraft.estimatedNutrition.carbsG, "carbs")}</span>
                <span>{formatMealMacro(repeatMealDraft.estimatedNutrition.fatsG, "fats")}</span>
                {repeatMealDraft.confidence < 0.65 ? (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    Approximate
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-7">
              <div
                ref={repeatMealSliderRef}
                role="slider"
                tabIndex={0}
                aria-label="Slide to add repeated meal"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(repeatMealSlideValue)}
                className={cn(
                  "relative h-[82px] w-full touch-none select-none overflow-hidden rounded-full bg-primary-strong shadow-[0_18px_34px_rgba(12,39,35,0.28)]",
                  repeatMealAddedNoticeOpen ? "pointer-events-none" : "",
                )}
                onPointerDown={handleRepeatMealPointerDown}
                onPointerMove={handleRepeatMealPointerMove}
                onPointerUp={handleRepeatMealPointerUp}
                onPointerCancel={handleRepeatMealPointerCancel}
              >
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span
                    className="text-[18px] font-semibold tracking-[-0.03em] text-white transition-opacity duration-200"
                    style={{ opacity: repeatMealSlideValue > 68 ? 0.45 : 1 }}
                  >
                    Slide to add meal
                  </span>
                </div>
                <div className="absolute inset-y-[7px] left-[7px] right-[71px]">
                  <div
                    className={cn(
                      "absolute top-0 flex h-16 w-16 items-center justify-center rounded-full bg-white text-foreground shadow-[0_8px_18px_rgba(0,0,0,0.18)]",
                      repeatMealDragging
                        ? "scale-[1.02]"
                        : "transition-[left,transform] duration-300 ease-out",
                    )}
                    style={{ left: `${repeatMealSlideValue}%` }}
                  >
                    <ChevronRight className="h-7 w-7 stroke-[2.6]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tier-gated on purpose: if something bigger already took the screen
          this run, the queue demotes this to inline and the shell's toast
          presents it instead. */}
      {firstMealCelebration &&
        currentCelebration?.code === CELEBRATION_FIRST_MEAL &&
        currentCelebration.tier === "takeover" && (
        <FirstMealLogged
          mealName={firstMealCelebration.mealName}
          kcal={firstMealCelebration.kcal}
          mealPhotoUrl={firstMealCelebration.photoUrl}
          streakDay={firstMealCelebration.streakDay}
          showMeal={firstMealCelebration.showMeal}
          onShare={shareFirstMeal}
          onDone={dismissFirstMealCelebration}
        />
      )}
    </div>
  );
}
