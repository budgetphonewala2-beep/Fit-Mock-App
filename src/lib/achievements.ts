import { differenceInCalendarDays, parseISO } from "date-fns";
import { toLocalIsoDate } from "@/lib/utils";
import {
  STREAK_LADDER,
  STREAK_MILESTONE_COPY,
  streakRunStart,
} from "@/lib/streak-milestones";
import type {
  Achievement,
  ChallengeEnrollment,
  DietFitState,
  DietTimelineMeal,
  MealLog,
  MealType,
  NutritionTargets,
  ReadinessLog,
  WaterLog,
  WorkoutLoadLog,
  WorkoutLog,
} from "@/lib/types";
import { generateDietTimelinePlan } from "@/lib/recommendations";

/**
 * Everything a milestone is allowed to look at. Adding a milestone should mean
 * adding one entry to a catalog below -- never threading a new argument through
 * the provider -- so this carries the whole logged history even where no
 * current definition reads it.
 */
export type AchievementContext = {
  today: string;
  streak: number;
  mealLogs: MealLog[];
  workoutLogs: WorkoutLog[];
  workoutLoadLogs: WorkoutLoadLog[];
  readinessLogs: ReadinessLog[];
  waterLogs: WaterLog[];
  challengeEnrollments: ChallengeEnrollment[];
  nutritionTargets: NutritionTargets | null;
  /**
   * Today's diet plan (breakfast / lunch / snacks / dinner) as the engine
   * would render it in the diet tab. Null when the plan can't be built yet
   * (fresh install, no profile). Consumed by the "day fully logged" win.
   */
  todaysPlannedMeals: DietTimelineMeal[] | null;
};

type AchievementContextSource = Pick<
  DietFitState,
  | "mealLogs"
  | "workoutLogs"
  | "workoutLoadLogs"
  | "readinessLogs"
  | "waterLogs"
  | "challengeEnrollments"
  | "nutritionTargets"
  | "streak"
  | "profile"
>;

/**
 * The single place the context is assembled, so a field added above reaches
 * every caller instead of only the one that happened to be updated.
 */
export function achievementContextFromState(
  state: AchievementContextSource,
  today: string,
): AchievementContext {
  const todaysPlannedMeals =
    state.profile && state.nutritionTargets
      ? generateDietTimelinePlan(state.profile, state.nutritionTargets)
      : null;

  return {
    today,
    streak: state.streak,
    mealLogs: state.mealLogs,
    workoutLogs: state.workoutLogs,
    workoutLoadLogs: state.workoutLoadLogs,
    readinessLogs: state.readinessLogs ?? [],
    waterLogs: state.waterLogs,
    challengeEnrollments: state.challengeEnrollments ?? [],
    nutritionTargets: state.nutritionTargets,
    todaysPlannedMeals,
  };
}

/**
 * Every date the user did something deliberate. Deliberately looser than
 * `calculateStreak`'s eligible day, which asks whether goals were *hit*: a
 * person can show up, log honestly, miss every target, and still be present.
 * Treating those days as absence is how you tell someone who never left that
 * they are welcome back.
 */
export function activityDates(context: AchievementContext): Set<string> {
  const dates = new Set<string>();

  for (const log of context.mealLogs) {
    dates.add(toLocalIsoDate(new Date(log.loggedAt)));
  }

  for (const log of context.workoutLogs) {
    if (log.completedSession || log.exercisesCompleted.length > 0) {
      dates.add(log.sessionDate);
    }
  }

  for (const log of context.workoutLoadLogs) {
    dates.add(log.sessionDate);
  }

  for (const log of context.readinessLogs) {
    dates.add(log.date);
  }

  for (const log of context.waterLogs) {
    if (log.amountMl > 0) {
      dates.add(log.date);
    }
  }

  for (const enrollment of context.challengeEnrollments) {
    dates.add(enrollment.startedAt);
  }

  return dates;
}

/**
 * How loudly a milestone lands.
 *
 * `takeover` is a full-screen moment the user dismisses, and blocks the app
 * while it is up. `inline` is an in-page card that dismisses itself and blocks
 * nothing. `badge` never interrupts at all -- it appears in the achievements
 * gallery, marked unseen until the user looks.
 */
export type CelebrationTier = "takeover" | "inline" | "badge";

type AchievementDefinition = {
  code: string;
  label: string;
  description: string;
  tier: CelebrationTier;
  /** Higher wins the one takeover slot when several land on the same day. */
  priority: number;
  /**
   * Answers "earned by now", not "true today". The ledger is append-only, so a
   * predicate that reads only today's numbers still works -- but it has to be
   * written knowing that going false again cannot take the milestone away.
   */
  isEarned: (context: AchievementContext) => boolean;
};

function proteinTotalsByDate(mealLogs: MealLog[]) {
  const totals = new Map<string, number>();

  for (const log of mealLogs) {
    const date = toLocalIsoDate(new Date(log.loggedAt));
    totals.set(date, (totals.get(date) ?? 0) + log.estimatedNutrition.proteinG);
  }

  return totals;
}

export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  {
    code: "first-workout",
    label: "First win",
    description: "Completed your first guided workout session.",
    // Worth a screen of its own eventually; a toast until someone builds one.
    tier: "inline",
    priority: 90,
    isEarned: ({ workoutLogs }) => workoutLogs.some((log) => log.completedSession),
  },
  {
    code: "meal-streak",
    label: "Meal captain",
    description: "Logged 5 meals and built a usable nutrition baseline.",
    // A counter, and counters reward duration rather than anything the user
    // can decide to do today. It belongs in the gallery, not in their face.
    tier: "badge",
    priority: 20,
    isEarned: ({ mealLogs }) => mealLogs.length >= 5,
  },
  // `three-day-streak` used to live here. The streak ladder replaced it: a
  // milestone is per-run, so a permanent one-time badge was the wrong shape.
  // Accounts that already earned it keep it -- reconcileAchievements never
  // drops a retired code from the ledger.
  {
    code: "protein-match",
    label: "Protein matched",
    tier: "inline",
    priority: 50,
    // Reads "on a day", not "today": a permanent badge cannot be worded as a
    // claim about the current date, and the predicate now scans every day.
    description: "Hit 90% of your protein target on a day.",
    isEarned: ({ mealLogs, nutritionTargets }) => {
      if (!nutritionTargets) {
        return false;
      }

      const threshold = nutritionTargets.proteinG * 0.9;

      return Array.from(proteinTotalsByDate(mealLogs).values()).some(
        (total) => total >= threshold,
      );
    },
  },
];

/**
 * Folds newly-earned milestones into the stored ledger.
 *
 * Append-only by construction: an entry that already exists keeps its original
 * `unlockedAt` and is never dropped, so recomputing on every state change
 * cannot rewrite unlock dates or un-earn a milestone whose condition has since
 * lapsed. Labels and descriptions are refreshed from the catalog, so copy edits
 * reach accounts that unlocked the milestone months ago.
 */
export function reconcileAchievements(
  existing: Achievement[],
  context: AchievementContext,
): Achievement[] {
  const previous = new Map(existing.map((achievement) => [achievement.code, achievement]));
  const ledger: Achievement[] = [];

  for (const definition of ACHIEVEMENT_CATALOG) {
    const earlier = previous.get(definition.code);
    previous.delete(definition.code);

    if (!earlier && !definition.isEarned(context)) {
      continue;
    }

    ledger.push({
      code: definition.code,
      label: definition.label,
      description: definition.description,
      unlockedAt: earlier?.unlockedAt ?? context.today,
    });
  }

  // Codes retired from the catalog stay in the ledger. Somebody earned them,
  // and a milestone that disappears is the bug this function exists to fix.
  return [...ledger, ...previous.values()];
}

/**
 * Wins that can happen again. A permanent badge is the wrong shape for these --
 * "hit protein" frozen forever says nothing, and a person can lapse and return
 * more than once -- so they are scoped to the day they happened instead.
 */
type RepeatableWinDefinition = {
  code: string;
  label: string;
  description: string;
  tier: CelebrationTier;
  priority: number;
  /**
   * What the win is scoped to, which decides when it can happen again.
   *
   * `day` repeats daily and expires -- those codes get pruned. `run` lasts as
   * long as a streak run and must survive pruning, or a long run would re-fire
   * a milestone it already showed.
   */
  scope: "day" | "run";
  /** The scope key right now, or null when the win cannot be earned at all. */
  scopeKeyFor: (context: AchievementContext) => string | null;
  isWon: (context: AchievementContext) => boolean;
  /**
   * `next-open` holds the celebration until the next app open rather than
   * interrupting the very log that earned it.
   */
  presentOn: "immediate" | "next-open";
};

/**
 * Consecutive empty days that count as having been away. From the comeback
 * handoff: under this is not a comeback, and the app opens normally.
 */
export const COMEBACK_AWAY_DAYS = 8;

/**
 * Distinct active days required before a gap counts as a lapse.
 *
 * One day of use then silence is an onboarding wobble, not a lapse. The
 * asymmetry decides the threshold: a missed comeback costs nothing, while
 * telling someone who was never here that they are welcome back cheapens every
 * other milestone.
 */
export const COMEBACK_MIN_PRIOR_ACTIVE_DAYS = 3;

/**
 * Empty days between the last active day and today, or null when today has no
 * activity yet or there is no earlier day to measure from.
 */
export function daysAwayBeforeToday(context: AchievementContext): number | null {
  const active = Array.from(activityDates(context)).sort();

  // Returning is an action, not an app open -- it lands when they log something.
  if (!active.includes(context.today)) {
    return null;
  }

  const earlier = active.filter((date) => date < context.today);

  if (earlier.length === 0) {
    return null;
  }

  return (
    differenceInCalendarDays(
      parseISO(context.today),
      parseISO(earlier[earlier.length - 1]),
    ) - 1
  );
}

export function isComebackToday(context: AchievementContext) {
  const priorActiveDays = Array.from(activityDates(context)).filter(
    (date) => date < context.today,
  ).length;

  if (priorActiveDays < COMEBACK_MIN_PRIOR_ACTIVE_DAYS) {
    return false;
  }

  const away = daysAwayBeforeToday(context);

  return away !== null && away >= COMEBACK_AWAY_DAYS;
}

/**
 * One rung of the streak ladder.
 *
 * Earned on `>=`, not `===`: the celebration waits for the next app open, by
 * which point the streak has usually moved past the milestone. The run-scoped
 * code is what stops it re-firing every day after that.
 */
function streakMilestoneDefinition(days: number): RepeatableWinDefinition {
  const copy = STREAK_MILESTONE_COPY[days];

  return {
    code: `streak-${days}`,
    label: copy.headline.replace("\n", " "),
    description: copy.toast,
    tier: "takeover",
    // Priority is the milestone itself, so when two land together the higher
    // rung takes the screen and the lower one demotes -- the handoff's rule.
    priority: days,
    scope: "run",
    scopeKeyFor: (context) => streakRunStart(context.streak, context.today),
    isWon: (context) => context.streak >= days,
    // Never mid-workout or mid-log.
    presentOn: "next-open",
  };
}

/**
 * The daily-nutrition win: today's protein and hydration targets both hit.
 *
 * Two-gate on purpose. Protein alone is easy to game with one big shake, and
 * water alone is a tap-tap-tap win, but both together mean the day's actual
 * fuelling was on-plan -- which is a moment worth interrupting for.
 *
 * Both gates use the 90% threshold the challenges page uses so the takeover
 * cannot be more forgiving than the challenge that watches the same metric.
 */
export function isNutritionDayHitToday(context: AchievementContext): boolean {
  const targets = context.nutritionTargets;
  if (!targets) return false;

  const proteinTarget = targets.proteinG * 0.9;
  if (proteinTarget <= 0) return false;

  const todayProtein = proteinTotalsByDate(context.mealLogs).get(context.today) ?? 0;
  if (todayProtein < proteinTarget) return false;

  const waterTargetMl = targets.micros.waterL * 1000 * 0.9;
  if (waterTargetMl <= 0) return false;

  const todayWaterMl =
    context.waterLogs.find((log) => log.date === context.today)?.amountMl ?? 0;
  return todayWaterMl >= waterTargetMl;
}

/**
 * Day-scoped: fires once per day, on the log that completes the day's diet
 * plan. Scoped by that day's ISO so a later day fires a fresh code and the
 * ledger expires the older one under the usual day-scoped pruning.
 */
export const CELEBRATION_DAY_FULLY_LOGGED = "day-fully-logged";

const REPEATABLE_WIN_CATALOG: RepeatableWinDefinition[] = [
  {
    code: "comeback",
    label: "Welcome back",
    description: "Your plan and your history are exactly where you left them.",
    tier: "takeover",
    // Above every streak rung (priority is the day number, so <= 100): the
    // handoff says the comeback always wins the first open, never stacking with
    // a milestone -- so a milestone landing the same open demotes to a toast.
    priority: 1000,
    scope: "day",
    scopeKeyFor: (context) => context.today,
    isWon: isComebackToday,
    presentOn: "immediate",
  },
  {
    code: "nutrition-day",
    label: "Nutrition dialed",
    description: "Protein and hydration both hit today.",
    tier: "takeover",
    // Below every streak rung. A streak milestone landing the same day should
    // win the takeover slot and demote this to its inline toast.
    priority: 40,
    scope: "day",
    scopeKeyFor: (context) => context.today,
    isWon: isNutritionDayHitToday,
    // Fires the moment the second gate closes -- the reward has to arrive
    // while the day it belongs to is still today, and day-scoped codes get
    // pruned overnight so next-open would be too late.
    presentOn: "immediate",
  },
  {
    code: CELEBRATION_DAY_FULLY_LOGGED,
    label: "Day fully logged",
    description: "Every meal in today's plan is logged.",
    tier: "takeover",
    // Below nutrition-day: when the last meal also closes the protein and
    // water gates, that one takes the screen and this demotes to a toast.
    priority: 30,
    scope: "day",
    scopeKeyFor: (context) => context.today,
    isWon: isDayFullyLogged,
    // On the log that completes the plan, while it's still that day.
    presentOn: "immediate",
  },
  ...STREAK_LADDER.map(streakMilestoneDefinition),
];

/**
 * The day's diet plan is "fully logged" when today's logs cover every planned
 * meal-slot's meal type. A plan with two snacks needs two logged snacks; the
 * user picking soup instead of the suggested salad still counts, as long as
 * it's saved into the same slot type. Nothing to celebrate if the plan hasn't
 * been generated yet.
 */
export function isDayFullyLogged(context: AchievementContext): boolean {
  if (!context.todaysPlannedMeals || context.todaysPlannedMeals.length === 0) {
    return false;
  }

  const need: Record<string, number> = {};
  for (const meal of context.todaysPlannedMeals) {
    need[meal.mealType] = (need[meal.mealType] ?? 0) + 1;
  }

  const have: Record<string, number> = {};
  for (const log of context.mealLogs) {
    if (toLocalIsoDate(new Date(log.loggedAt)) !== context.today) {
      continue;
    }
    have[log.mealType] = (have[log.mealType] ?? 0) + 1;
  }

  return (Object.keys(need) as MealType[]).every(
    (type) => (have[type] ?? 0) >= (need[type] ?? 0),
  );
}

/**
 * Celebration codes. A code is claimed here once its screen has been presented.
 *
 * Codes that match a catalog milestone are the achievement's own code; the rest
 * name one-off screens that are not permanent badges. Either way a celebration
 * asks the same ledger instead of growing its own persisted boolean.
 */
export const CELEBRATION_FIRST_MEAL = "first-meal";

export function hasSeenCelebration(seenCelebrations: string[] | undefined, code: string) {
  return (seenCelebrations ?? []).includes(code);
}

/** Milestones in the ledger whose celebration has not run yet. */
export function pendingAchievementCelebrations(
  achievements: Achievement[],
  seenCelebrations: string[] | undefined,
) {
  const seen = new Set(seenCelebrations ?? []);

  return achievements.filter((achievement) => !seen.has(achievement.code));
}

/**
 * Repeatable wins currently standing, as scoped codes, minus any already
 * presented.
 *
 * The scope key in the code is what makes these recur: a new day (or a new
 * streak run) asks again under a new code, while a win already claimed in this
 * scope cannot fire twice.
 *
 * `atSessionOpen` is only true on the first evaluation after the app opens.
 * Milestones marked `next-open` are skipped otherwise, so the log that earns
 * one never gets interrupted by it.
 */
export function pendingRepeatableCelebrations(
  context: AchievementContext,
  seenCelebrations: string[] | undefined,
  options: { atSessionOpen: boolean },
) {
  const seen = new Set(seenCelebrations ?? []);
  const codes: string[] = [];

  for (const definition of REPEATABLE_WIN_CATALOG) {
    if (definition.presentOn === "next-open" && !options.atSessionOpen) {
      continue;
    }

    const scopeKey = definition.scopeKeyFor(context);

    if (!scopeKey) {
      continue;
    }

    const code = scopedCelebrationCode(definition.code, scopeKey);

    if (!seen.has(code) && definition.isWon(context)) {
      codes.push(code);
    }
  }

  return codes;
}

/**
 * Breathing room between two celebrations in the same run. Nothing is blocking
 * during the gap -- the app is fully usable -- so this is a pause, not a wait.
 */
export const CELEBRATION_GAP_MS = 6000;

/** One thing waiting to be celebrated, with the tier it will actually run at. */
export type CelebrationRequest = {
  code: string;
  tier: CelebrationTier;
  priority: number;
};

const TIER_ORDER: Record<CelebrationTier, number> = {
  takeover: 0,
  inline: 1,
  badge: 2,
};

/**
 * Codes that are not ledger milestones: the one-off screens that carry their
 * own payload, and the daily wins. Keyed by the bare code, so a dated daily win
 * inherits its base code's entry.
 *
 * The copy is what the inline presenter falls back to. A takeover that gets
 * demoted has to have something to say in a toast, since its bespoke screen is
 * not what runs.
 */
const CELEBRATION_PRESENTATION: Record<
  string,
  Omit<CelebrationRequest, "code"> & { label: string; description: string }
> = {
  [CELEBRATION_FIRST_MEAL]: {
    tier: "takeover",
    priority: 100,
    label: "First meal logged",
    description: "It starts here. Day 1 on the board.",
  },
};

type Presentation = {
  tier: CelebrationTier;
  priority: number;
  label: string;
  description: string;
};

/** Resolves a bare code across both catalogs and the one-off registry. */
function presentationFor(baseCode: string): Presentation | null {
  return (
    ACHIEVEMENT_CATALOG.find((entry) => entry.code === baseCode) ??
    REPEATABLE_WIN_CATALOG.find((entry) => entry.code === baseCode) ??
    CELEBRATION_PRESENTATION[baseCode] ??
    null
  );
}

/**
 * Codes with a full-screen component wired up to render them.
 *
 * The takeover tier is a promise that something will present the code and call
 * `dismissCelebration`. Nothing does that generically, so a takeover with no
 * screen would sit at the head of the queue forever and block every celebration
 * behind it. Declaring a tier and forgetting the screen degrades to a toast.
 */
const TAKEOVER_RENDERERS = new Set([
  CELEBRATION_FIRST_MEAL,
  CELEBRATION_DAY_FULLY_LOGGED,
  "comeback",
  "nutrition-day",
  ...STREAK_LADDER.map((days) => `streak-${days}`),
]);

/**
 * Looks up how a code should be presented. Anything undeclared presents inline
 * at the back of the run -- visible, but never stealing the takeover slot from
 * a milestone that was designed for it.
 */
export function celebrationRequestFor(code: string): CelebrationRequest {
  const baseCode = parseScopedCelebrationCode(code)?.code ?? code;
  const declared = presentationFor(baseCode);

  if (!declared) {
    return { code, tier: "inline", priority: 0 };
  }

  const tier =
    declared.tier === "takeover" && !TAKEOVER_RENDERERS.has(baseCode)
      ? "inline"
      : declared.tier;

  return { code, tier, priority: declared.priority };
}

/**
 * The words the generic inline presenter shows for a code.
 *
 * Ledger milestones carry their own copy; everything else falls back to the
 * presentation registry. Returns null when a code has no copy anywhere, which
 * is the signal not to render a toast for it at all.
 */
export function celebrationCopyFor(
  code: string,
  achievements: Achievement[],
): { label: string; description: string } | null {
  const baseCode = parseScopedCelebrationCode(code)?.code ?? code;
  const declared = presentationFor(baseCode);

  if (declared) {
    return { label: declared.label, description: declared.description };
  }

  // Retired codes have no definition left, but the ledger still carries the
  // copy they were earned under.
  const unlocked = achievements.find((achievement) => achievement.code === baseCode);

  return unlocked ? { label: unlocked.label, description: unlocked.description } : null;
}

/**
 * Orders a burst of celebrations into a run the user can actually absorb.
 *
 * Badges are dropped -- they never interrupt. Everything else is ordered by
 * tier then priority, and **only the first takeover stays a takeover**: the
 * rest demote to inline. Three full-screen moments back to back is still a
 * bombardment however far apart they are spaced, and demoting keeps every win
 * while letting the biggest one have the screen to itself.
 */
export function planCelebrationRun(
  requests: CelebrationRequest[],
  options: { takeoverAvailable?: boolean } = {},
): CelebrationRequest[] {
  let takeoverAvailable = options.takeoverAvailable ?? true;

  return requests
    .filter((request) => request.tier !== "badge")
    .sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        b.priority - a.priority ||
        a.code.localeCompare(b.code),
    )
    .map((request) => {
      if (request.tier !== "takeover") {
        return request;
      }

      if (!takeoverAvailable) {
        return { ...request, tier: "inline" as const };
      }

      takeoverAvailable = false;
      return request;
    });
}

/**
 * Adds one celebration to a run in progress.
 *
 * `presentedCode` is the code actually on screen -- not merely first in the
 * queue. Only that one is pinned; everything else re-plans. Pinning the head
 * unconditionally looks equivalent and is not: during the opening burst each
 * code is enqueued in turn, so the first to arrive would become an unpinnable
 * head and hold the run against every higher-priority celebration behind it.
 */
export function enqueueIntoRun(
  queue: CelebrationRequest[],
  request: CelebrationRequest,
  options: { presentedCode: string | null; takeoverAvailable: boolean },
): CelebrationRequest[] {
  const [head, ...waiting] = queue;
  const headIsOnScreen = head !== undefined && options.presentedCode === head.code;
  const planned = planCelebrationRun([...(headIsOnScreen ? waiting : queue), request], {
    takeoverAvailable: options.takeoverAvailable,
  });

  return headIsOnScreen ? [head, ...planned] : planned;
}

// Repeatable wins cannot be ledger milestones -- a permanent badge for
// something that recurs says nothing -- so they reuse the seen-ledger with
// their scope key folded into the code instead.
const SCOPE_SEPARATOR = "@";

export function scopedCelebrationCode(code: string, scopeKey: string) {
  return `${code}${SCOPE_SEPARATOR}${scopeKey}`;
}

export function parseScopedCelebrationCode(code: string) {
  const separatorIndex = code.indexOf(SCOPE_SEPARATOR);

  if (separatorIndex === -1) {
    return null;
  }

  return {
    code: code.slice(0, separatorIndex),
    scopeKey: code.slice(separatorIndex + 1),
  };
}

/**
 * Day-scoped codes accumulate one entry per win per day, and the whole state
 * blob is re-serialized to Firebase on every change, so they cannot be kept
 * forever.
 *
 * Only day-scoped codes expire. One-time codes are bounded by the catalog, and
 * run-scoped codes have to outlive the window entirely: a streak run longer
 * than the retention period would otherwise forget it had already shown day 3
 * and fire it again on day 31.
 */
export const SEEN_CELEBRATION_RETENTION_DAYS = 30;

function isDayScoped(baseCode: string) {
  return REPEATABLE_WIN_CATALOG.some(
    (definition) => definition.code === baseCode && definition.scope === "day",
  );
}

export function pruneSeenCelebrations(
  seenCelebrations: string[],
  today: string,
  retentionDays = SEEN_CELEBRATION_RETENTION_DAYS,
) {
  const cutoffDate = new Date(`${today}T00:00:00`);
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoff = toLocalIsoDate(cutoffDate);

  return seenCelebrations.filter((entry) => {
    const scoped = parseScopedCelebrationCode(entry);

    if (!scoped || !isDayScoped(scoped.code)) {
      return true;
    }

    return scoped.scopeKey >= cutoff;
  });
}

/** The two fields that carry celebration history on a persisted state blob. */
type SeenCelebrationSource = {
  seenCelebrations?: string[];
  hasSeenFirstMealCelebration?: boolean;
};

// A side that predates the ledger still knows one thing -- whether the
// first-meal screen ran -- so read the retired flag rather than lose it.
function celebrationCodesFor(state: SeenCelebrationSource) {
  const codes = state.seenCelebrations ?? [];

  return state.hasSeenFirstMealCelebration ? [...codes, CELEBRATION_FIRST_MEAL] : codes;
}

/**
 * Unions two devices' seen-ledgers, but only once at least one side has one.
 *
 * Sticky in both directions: if either device has shown a celebration, a
 * reinstall or a second device must not replay it. Returning `[]` when neither
 * side has migrated would look like a real empty ledger and skip the backfill
 * below, queueing every already-earned milestone as an unseen celebration --
 * hence `undefined`, which keeps the "not migrated yet" signal intact.
 */
export function mergeSeenCelebrations(
  remote: SeenCelebrationSource,
  local: SeenCelebrationSource,
) {
  if (!remote.seenCelebrations && !local.seenCelebrations) {
    return undefined;
  }

  return Array.from(
    new Set([...celebrationCodesFor(remote), ...celebrationCodesFor(local)]),
  );
}

/**
 * Seeds the seen-ledger for state persisted before celebrations were tracked
 * generically.
 *
 * Everything already in the ledger was earned without a screen ever running, so
 * it is marked seen rather than replayed -- otherwise the first launch after
 * this ships fires months of history at once. Only unlocks that happen from
 * here on are treated as pending.
 */
export function backfillSeenCelebrations(args: {
  achievements: Achievement[];
  hasLoggedMeal: boolean;
  hasSeenFirstMealCelebration?: boolean;
}) {
  const codes = args.achievements.map((achievement) => achievement.code);

  if (args.hasSeenFirstMealCelebration || args.hasLoggedMeal) {
    codes.push(CELEBRATION_FIRST_MEAL);
  }

  return Array.from(new Set(codes));
}
