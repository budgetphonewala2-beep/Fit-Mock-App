import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_CATALOG,
  backfillSeenCelebrations,
  CELEBRATION_DAY_FULLY_LOGGED,
  CELEBRATION_FIRST_MEAL,
  celebrationCopyFor,
  celebrationRequestFor,
  COMEBACK_MIN_PRIOR_ACTIVE_DAYS,
  scopedCelebrationCode,
  daysAwayBeforeToday,
  enqueueIntoRun,
  isComebackToday,
  pendingRepeatableCelebrations,
  mergeSeenCelebrations,
  pendingAchievementCelebrations,
  planCelebrationRun,
  pruneSeenCelebrations,
  reconcileAchievements,
  SEEN_CELEBRATION_RETENTION_DAYS,
  type AchievementContext,
} from "@/lib/achievements";
import { streakRunStart } from "@/lib/streak-milestones";
import type {
  Achievement,
  DietTimelineMeal,
  MealLog,
  MealType,
  NutritionTargets,
  WorkoutLog,
} from "@/lib/types";

function mealLog(loggedAt: string, proteinG: number): MealLog {
  return {
    id: `meal-${loggedAt}-${proteinG}`,
    rawText: "test meal",
    parsedItems: [],
    mealType: "lunch",
    loggedAt,
    estimatedNutrition: {
      calories: 400,
      proteinG,
      carbsG: 30,
      fatsG: 10,
      fiberG: 4,
      micros: {},
    },
    confidence: 1,
    coachTip: "",
  };
}

function workoutLog(sessionDate: string, completedSession: boolean): WorkoutLog {
  return {
    id: `workout-${sessionDate}`,
    sessionDate,
    sessionId: "session-1",
    exercisesCompleted: ["push-up"],
    completedSession,
    effort: "steady",
    notes: "",
  };
}

const nutritionTargets = { proteinG: 100 } as NutritionTargets;

function context(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    today: "2026-08-12",
    streak: 0,
    mealLogs: [],
    workoutLogs: [],
    workoutLoadLogs: [],
    readinessLogs: [],
    waterLogs: [],
    challengeEnrollments: [],
    nutritionTargets: null,
    todaysPlannedMeals: null,
    ...overrides,
  };
}

function codes(achievements: Achievement[]) {
  return achievements.map((achievement) => achievement.code);
}

describe("reconcileAchievements", () => {
  it("stamps a newly earned milestone with today", () => {
    const ledger = reconcileAchievements(
      [],
      context({ workoutLogs: [workoutLog("2026-08-12", true)] }),
    );

    expect(codes(ledger)).toEqual(["first-workout"]);
    expect(ledger[0].unlockedAt).toBe("2026-08-12");
  });

  it("keeps the original unlock date when it runs again on a later day", () => {
    const earned = reconcileAchievements(
      [],
      context({ today: "2026-03-01", workoutLogs: [workoutLog("2026-03-01", true)] }),
    );

    const recomputed = reconcileAchievements(
      earned,
      context({ today: "2026-08-12", workoutLogs: [workoutLog("2026-03-01", true)] }),
    );

    expect(recomputed[0].unlockedAt).toBe("2026-03-01");
  });

  it("keeps a milestone whose condition has since lapsed", () => {
    const fiveMeals = Array.from({ length: 5 }, (_, index) =>
      mealLog(`2026-08-0${index + 1}T13:00:00`, 10),
    );
    const earned = reconcileAchievements([], context({ mealLogs: fiveMeals }));
    expect(codes(earned)).toEqual(["meal-streak"]);

    // Logs pruned away. The badge was still earned.
    const recomputed = reconcileAchievements(earned, context({ mealLogs: [] }));
    expect(codes(recomputed)).toEqual(["meal-streak"]);
  });

  it("refreshes label and description from the catalog", () => {
    const stale: Achievement = {
      code: "first-workout",
      label: "Old label",
      description: "Old description.",
      unlockedAt: "2026-03-01",
    };

    const [reconciled] = reconcileAchievements(
      [stale],
      context({ workoutLogs: [workoutLog("2026-03-01", true)] }),
    );
    const definition = ACHIEVEMENT_CATALOG.find((entry) => entry.code === "first-workout");

    expect(reconciled.label).toBe(definition?.label);
    expect(reconciled.description).toBe(definition?.description);
    expect(reconciled.unlockedAt).toBe("2026-03-01");
  });

  it("keeps codes that are no longer in the catalog", () => {
    const retired: Achievement = {
      code: "retired-milestone",
      label: "Retired",
      description: "Earned before the catalog changed.",
      unlockedAt: "2026-01-05",
    };

    expect(codes(reconcileAchievements([retired], context()))).toEqual([
      "retired-milestone",
    ]);
  });

  it("earns protein on a past day, not only on today", () => {
    const ledger = reconcileAchievements(
      [],
      context({
        today: "2026-08-12",
        mealLogs: [mealLog("2026-08-09T13:00:00", 95)],
        nutritionTargets,
      }),
    );

    expect(codes(ledger)).toContain("protein-match");
  });

  it("does not earn protein below 90% of target", () => {
    const ledger = reconcileAchievements(
      [],
      context({ mealLogs: [mealLog("2026-08-12T13:00:00", 40)], nutritionTargets }),
    );

    expect(codes(ledger)).not.toContain("protein-match");
  });
});

describe("backfillSeenCelebrations", () => {
  it("marks everything already earned as seen so history is not replayed", () => {
    const existing: Achievement[] = [
      { code: "first-workout", label: "", description: "", unlockedAt: "2026-03-01" },
      { code: "meal-streak", label: "", description: "", unlockedAt: "2026-03-04" },
    ];

    const seen = backfillSeenCelebrations({ achievements: existing, hasLoggedMeal: true });

    expect(seen).toContain("first-workout");
    expect(seen).toContain("meal-streak");
    expect(pendingAchievementCelebrations(existing, seen)).toEqual([]);
  });

  it("claims the first-meal code from the retired flag", () => {
    expect(
      backfillSeenCelebrations({
        achievements: [],
        hasLoggedMeal: false,
        hasSeenFirstMealCelebration: true,
      }),
    ).toEqual([CELEBRATION_FIRST_MEAL]);
  });

  it("leaves a brand new account with nothing marked seen", () => {
    expect(
      backfillSeenCelebrations({ achievements: [], hasLoggedMeal: false }),
    ).toEqual([]);
  });
});

describe("isComebackToday", () => {
  // Three prior active days clears the anchor; the gap is what varies.
  function afterGap(lastSeen: string, today: string) {
    return context({
      today,
      mealLogs: [
        mealLog("2026-06-01T09:00:00", 20),
        mealLog("2026-06-02T09:00:00", 20),
        mealLog(`${lastSeen}T09:00:00`, 20),
        mealLog(`${today}T09:00:00`, 20),
      ],
    });
  }

  it("fires after eight empty days", () => {
    // Last seen Aug 3, back Aug 12: Aug 4-11 empty.
    expect(isComebackToday(afterGap("2026-08-03", "2026-08-12"))).toBe(true);
  });

  it("does not fire at seven empty days", () => {
    expect(isComebackToday(afterGap("2026-08-04", "2026-08-12"))).toBe(false);
  });

  it("does not fire without enough prior activity", () => {
    const barelyUsed = context({
      today: "2026-08-12",
      mealLogs: [
        mealLog("2026-08-01T09:00:00", 20),
        mealLog("2026-08-12T09:00:00", 20),
      ],
    });

    expect(isComebackToday(barelyUsed)).toBe(false);
    expect(COMEBACK_MIN_PRIOR_ACTIVE_DAYS).toBe(3);
  });

  it("does not fire until they actually do something today", () => {
    const openedButIdle = context({
      today: "2026-08-12",
      mealLogs: [
        mealLog("2026-06-01T09:00:00", 20),
        mealLog("2026-06-02T09:00:00", 20),
        mealLog("2026-08-01T09:00:00", 20),
      ],
    });

    expect(isComebackToday(openedButIdle)).toBe(false);
  });

  it("counts a readiness check-in as presence, so a daily user is never 'away'", () => {
    const checkedInThroughout = context({
      today: "2026-08-12",
      mealLogs: [
        mealLog("2026-06-01T09:00:00", 20),
        mealLog("2026-06-02T09:00:00", 20),
        mealLog("2026-08-06T09:00:00", 20),
        mealLog("2026-08-12T09:00:00", 20),
      ],
      readinessLogs: ["2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11"].map(
        (date) => ({
          date,
          sleepHours: 7,
          energyLevel: 3,
          muscleSoreness: 2,
          loggedAt: `${date}T07:00:00`,
        }),
      ),
    });

    expect(isComebackToday(checkedInThroughout)).toBe(false);
  });

  it("reports the gap it measured", () => {
    expect(daysAwayBeforeToday(afterGap("2026-08-03", "2026-08-12"))).toBe(8);
  });
});

describe("pendingRepeatableCelebrations", () => {
  const comebackDay = context({
    today: "2026-08-12",
    mealLogs: [
      mealLog("2026-06-01T09:00:00", 20),
      mealLog("2026-06-02T09:00:00", 20),
      mealLog("2026-08-03T09:00:00", 20),
      mealLog("2026-08-12T09:00:00", 20),
    ],
  });

  const open = { atSessionOpen: true };

  it("returns today's win as a dated code", () => {
    expect(pendingRepeatableCelebrations(comebackDay, [], open)).toEqual([
      scopedCelebrationCode("comeback", "2026-08-12"),
    ]);
  });

  it("does not repeat a win already presented today", () => {
    const seen = [scopedCelebrationCode("comeback", "2026-08-12")];

    expect(pendingRepeatableCelebrations(comebackDay, seen, open)).toEqual([]);
  });

  it("can fire again after a later lapse, unlike a ledger milestone", () => {
    const seenFirstComeback = [scopedCelebrationCode("comeback", "2026-08-12")];
    const secondLapse = context({
      today: "2026-09-20",
      mealLogs: [
        ...comebackDay.mealLogs,
        mealLog("2026-09-20T09:00:00", 20),
      ],
    });

    expect(pendingRepeatableCelebrations(secondLapse, seenFirstComeback, open)).toEqual([
      scopedCelebrationCode("comeback", "2026-09-20"),
    ]);
  });

  it("still fires an immediate win mid-session", () => {
    // Comeback is `immediate`; only streak milestones wait for the next open.
    expect(
      pendingRepeatableCelebrations(comebackDay, [], { atSessionOpen: false }),
    ).toContain(scopedCelebrationCode("comeback", "2026-08-12"));
  });
});

describe("streak milestones", () => {
  const open = { atSessionOpen: true };
  // Streak of 5 on the 12th means the run began on the 8th.
  const runStart = "2026-08-08";
  const day5 = context({ today: "2026-08-12", streak: 5 });

  it("holds a milestone back until the next app open", () => {
    expect(
      pendingRepeatableCelebrations(day5, [], { atSessionOpen: false }),
    ).not.toContain(scopedCelebrationCode("streak-3", runStart));

    expect(pendingRepeatableCelebrations(day5, [], open)).toContain(
      scopedCelebrationCode("streak-3", runStart),
    );
  });

  it("still owes day 3 once the streak has moved past it", () => {
    // Earned on >=, so a milestone reached yesterday is not lost by waiting.
    expect(pendingRepeatableCelebrations(day5, [], open)).toContain(
      scopedCelebrationCode("streak-3", runStart),
    );
  });

  it("does not owe a rung the streak has not reached", () => {
    expect(pendingRepeatableCelebrations(day5, [], open)).not.toContain(
      scopedCelebrationCode("streak-7", runStart),
    );
  });

  it("fires again for a new run after the streak breaks", () => {
    const seenInFirstRun = [scopedCelebrationCode("streak-3", runStart)];
    // A fresh run: streak 3 on the 20th began on the 18th.
    const newRun = context({ today: "2026-08-20", streak: 3 });

    expect(pendingRepeatableCelebrations(newRun, seenInFirstRun, open)).toEqual([
      scopedCelebrationCode("streak-3", "2026-08-18"),
    ]);
  });

  it("gives the higher rung the takeover when two land together", () => {
    const day14 = context({ today: "2026-08-12", streak: 14 });
    const owed = pendingRepeatableCelebrations(day14, [], open);
    const planned = planCelebrationRun(owed.map(celebrationRequestFor));

    expect(planned[0].code).toBe(
      scopedCelebrationCode("streak-14", streakRunStart(14, "2026-08-12")!),
    );
    expect(planned[0].tier).toBe("takeover");
    expect(planned.slice(1).every((request) => request.tier === "inline")).toBe(true);
  });

  it("owes nothing without a streak", () => {
    expect(pendingRepeatableCelebrations(context({ streak: 0 }), [], open)).toEqual([]);
  });
});

describe("celebrationRequestFor", () => {
  it("reads tier and priority from the catalog", () => {
    expect(celebrationRequestFor("protein-match")).toEqual({
      code: "protein-match",
      tier: "inline",
      priority: 50,
    });
  });

  it("degrades a takeover with no screen wired up to a toast", () => {
    // first-workout declares takeover but has no bespoke component yet. Left
    // as-is it would sit at the head of the queue forever.
    expect(celebrationRequestFor("first-workout")).toEqual({
      code: "first-workout",
      tier: "inline",
      priority: 90,
    });
  });

  it("keeps the takeover tier for codes that do have a screen", () => {
    expect(celebrationRequestFor(CELEBRATION_FIRST_MEAL).tier).toBe("takeover");
  });

  it("keeps comeback a takeover, above every streak rung", () => {
    // Comeback has a screen and must win the first open, so it outranks the
    // milestones (whose priority is the day number, <= 100).
    expect(celebrationRequestFor(scopedCelebrationCode("comeback", "2026-08-12"))).toEqual({
      code: scopedCelebrationCode("comeback", "2026-08-12"),
      tier: "takeover",
      priority: 1000,
    });
  });

  it("inherits the base code's tier for a dated daily win", () => {
    const dated = scopedCelebrationCode("protein-match", "2026-08-12");

    expect(celebrationRequestFor(dated)).toEqual({
      code: dated,
      tier: "inline",
      priority: 50,
    });
  });

  it("falls back to inline at the back of the run for undeclared codes", () => {
    expect(celebrationRequestFor("something-new")).toEqual({
      code: "something-new",
      tier: "inline",
      priority: 0,
    });
  });
});

describe("planCelebrationRun", () => {
  it("keeps only the first takeover and demotes the rest", () => {
    const comeback = scopedCelebrationCode("comeback", "2026-08-12");
    const planned = planCelebrationRun([
      celebrationRequestFor(CELEBRATION_FIRST_MEAL),
      celebrationRequestFor(comeback),
      celebrationRequestFor("protein-match"),
    ]);

    // Comeback's priority (1000) wins the single takeover slot; the rest demote.
    expect(planned.map((request) => [request.code, request.tier])).toEqual([
      [comeback, "takeover"],
      [CELEBRATION_FIRST_MEAL, "inline"],
      ["protein-match", "inline"],
    ]);
  });

  it("loses nothing when it demotes", () => {
    const requests = [
      celebrationRequestFor(scopedCelebrationCode("comeback", "2026-08-12")),
      celebrationRequestFor("first-workout"),
      celebrationRequestFor(CELEBRATION_FIRST_MEAL),
    ];

    expect(planCelebrationRun(requests)).toHaveLength(requests.length);
  });

  it("drops badges, which never interrupt", () => {
    const planned = planCelebrationRun([
      celebrationRequestFor("meal-streak"),
      celebrationRequestFor("protein-match"),
    ]);

    expect(planned.map((request) => request.code)).toEqual(["protein-match"]);
  });

  it("demotes every takeover once the slot is already spent", () => {
    const planned = planCelebrationRun([celebrationRequestFor("first-workout")], {
      takeoverAvailable: false,
    });

    expect(planned[0].tier).toBe("inline");
  });

  it("orders equal tiers by priority", () => {
    const planned = planCelebrationRun([
      { code: "low", tier: "inline", priority: 1 },
      { code: "high", tier: "inline", priority: 99 },
    ]);

    expect(planned.map((request) => request.code)).toEqual(["high", "low"]);
  });
});

describe("celebrationCopyFor", () => {
  const unlocked: Achievement[] = [
    {
      code: "first-workout",
      label: "First win",
      description: "Completed your first guided workout session.",
      unlockedAt: "2026-03-01",
    },
  ];

  it("prefers the ledger's own copy", () => {
    expect(celebrationCopyFor("first-workout", unlocked)).toEqual({
      label: "First win",
      description: "Completed your first guided workout session.",
    });
  });

  it("gives a demoted one-off screen something to say in a toast", () => {
    expect(celebrationCopyFor(CELEBRATION_FIRST_MEAL, [])?.label).toBe("First meal logged");
  });

  it("resolves a dated daily win through its base code", () => {
    expect(
      celebrationCopyFor(scopedCelebrationCode("first-workout", "2026-08-12"), unlocked)
        ?.label,
    ).toBe("First win");
  });

  it("returns null for a code with no copy, so no blank toast renders", () => {
    expect(celebrationCopyFor("unknown-code", [])).toBeNull();
  });
});

describe("enqueueIntoRun", () => {
  const comeback = scopedCelebrationCode("comeback", "2026-08-12");

  it("lets a later, higher-priority code take the head before anything is on screen", () => {
    // Regression: ledger unlocks enqueue before daily wins, so a lower-priority
    // code arrived first. Pinning the head unconditionally left the genuine
    // takeover stuck behind it.
    const afterFirst = enqueueIntoRun([], celebrationRequestFor("first-workout"), {
      presentedCode: null,
      takeoverAvailable: true,
    });
    const afterSecond = enqueueIntoRun(
      afterFirst,
      celebrationRequestFor(CELEBRATION_FIRST_MEAL),
      { presentedCode: null, takeoverAvailable: true },
    );

    expect(afterSecond.map((request) => request.code)).toEqual([
      CELEBRATION_FIRST_MEAL,
      "first-workout",
    ]);
    expect(afterSecond[0].tier).toBe("takeover");
  });

  it("never swaps out a celebration that is already on screen", () => {
    const onScreen = [celebrationRequestFor(CELEBRATION_FIRST_MEAL)];

    const result = enqueueIntoRun(onScreen, celebrationRequestFor(comeback), {
      presentedCode: CELEBRATION_FIRST_MEAL,
      takeoverAvailable: false,
    });

    expect(result[0].code).toBe(CELEBRATION_FIRST_MEAL);
    expect(result[1].code).toBe(comeback);
  });

  it("demotes a newcomer once the takeover slot is spent", () => {
    const result = enqueueIntoRun([], celebrationRequestFor(comeback), {
      presentedCode: null,
      takeoverAvailable: false,
    });

    expect(result[0].tier).toBe("inline");
  });
});

describe("pruneSeenCelebrations", () => {
  it("keeps one-time codes forever", () => {
    expect(
      pruneSeenCelebrations(["first-workout", CELEBRATION_FIRST_MEAL], "2027-12-31"),
    ).toEqual(["first-workout", CELEBRATION_FIRST_MEAL]);
  });

  it("drops day-scoped codes past the retention window", () => {
    const kept = scopedCelebrationCode("comeback", "2026-08-01");
    const dropped = scopedCelebrationCode("comeback", "2026-01-01");

    expect(pruneSeenCelebrations([kept, dropped], "2026-08-12")).toEqual([kept]);
  });

  it("keeps a day-scoped code sitting exactly on the cutoff", () => {
    // 30 days before 2026-08-12, as a local date -- the boundary is inclusive.
    expect(SEEN_CELEBRATION_RETENTION_DAYS).toBe(30);
    const onCutoff = scopedCelebrationCode("comeback", "2026-07-13");

    expect(pruneSeenCelebrations([onCutoff], "2026-08-12")).toEqual([onCutoff]);
  });

  it("drops the day before the cutoff", () => {
    const justPast = scopedCelebrationCode("comeback", "2026-07-12");

    expect(pruneSeenCelebrations([justPast], "2026-08-12")).toEqual([]);
  });

  it("never prunes a run-scoped milestone, however long the run gets", () => {
    // A 200-day streak would otherwise forget it had shown day 3 and re-fire it.
    const day3 = scopedCelebrationCode("streak-3", "2026-01-01");

    expect(pruneSeenCelebrations([day3], "2026-08-12")).toEqual([day3]);
  });
});

describe("mergeSeenCelebrations", () => {
  it("stays undefined when neither side has migrated, so the backfill still runs", () => {
    expect(mergeSeenCelebrations({}, {})).toBeUndefined();
    expect(
      mergeSeenCelebrations({ hasSeenFirstMealCelebration: true }, {}),
    ).toBeUndefined();
  });

  it("unions both sides without duplicating", () => {
    expect(
      mergeSeenCelebrations(
        { seenCelebrations: ["first-workout", CELEBRATION_FIRST_MEAL] },
        { seenCelebrations: ["first-workout", "three-day-streak"] },
      ),
    ).toEqual(["first-workout", CELEBRATION_FIRST_MEAL, "three-day-streak"]);
  });

  it("reads the retired flag from a side that has not migrated", () => {
    expect(
      mergeSeenCelebrations(
        { hasSeenFirstMealCelebration: true },
        { seenCelebrations: ["first-workout"] },
      ),
    ).toEqual([CELEBRATION_FIRST_MEAL, "first-workout"]);
  });

  it("keeps a migrated empty ledger from replaying the other side's history", () => {
    expect(
      mergeSeenCelebrations({ seenCelebrations: [] }, { seenCelebrations: [] }),
    ).toEqual([]);
  });
});

describe("pendingAchievementCelebrations", () => {
  it("returns only milestones unlocked since the ledger was seeded", () => {
    const existing: Achievement[] = [
      { code: "first-workout", label: "", description: "", unlockedAt: "2026-03-01" },
    ];
    const seen = backfillSeenCelebrations({ achievements: existing, hasLoggedMeal: true });

    const laterLedger: Achievement[] = [
      ...existing,
      { code: "three-day-streak", label: "", description: "", unlockedAt: "2026-08-12" },
    ];

    expect(codes(pendingAchievementCelebrations(laterLedger, seen))).toEqual([
      "three-day-streak",
    ]);
  });
});

describe("day fully logged", () => {
  const open = { atSessionOpen: false };
  const plannedMeal = (mealType: MealType): DietTimelineMeal => ({
    id: `plan-${mealType}`,
    time: "09:00",
    title: mealType,
    mealType,
    quantity: "1 plate",
    purpose: "",
    calories: 400,
    proteinG: 20,
    carbsG: 40,
    fatsG: 10,
  });
  const loggedAs = (mealType: MealType, loggedAt: string): MealLog => ({
    ...mealLog(loggedAt, 20),
    id: `meal-${mealType}`,
    mealType,
  });
  const plan = [plannedMeal("breakfast"), plannedMeal("lunch"), plannedMeal("dinner")];
  const code = scopedCelebrationCode(CELEBRATION_DAY_FULLY_LOGGED, "2026-08-12");

  // The reported gap: the screen existed but nothing ever queued it.
  it("is owed on the log that completes the day's plan", () => {
    const allLogged = context({
      todaysPlannedMeals: plan,
      mealLogs: [
        loggedAs("breakfast", "2026-08-12T08:00:00"),
        loggedAs("lunch", "2026-08-12T13:00:00"),
        loggedAs("dinner", "2026-08-12T20:00:00"),
      ],
    });

    expect(pendingRepeatableCelebrations(allLogged, [], open)).toContain(code);
    expect(pendingRepeatableCelebrations(allLogged, [code], open)).not.toContain(code);
  });

  it("is not owed while a planned meal is missing", () => {
    const dinnerMissing = context({
      todaysPlannedMeals: plan,
      mealLogs: [
        loggedAs("breakfast", "2026-08-12T08:00:00"),
        loggedAs("lunch", "2026-08-12T13:00:00"),
      ],
    });

    expect(pendingRepeatableCelebrations(dinnerMissing, [], open)).not.toContain(code);
  });

  it("is a takeover with a screen, so it never blocks the queue", () => {
    expect(celebrationRequestFor(code).tier).toBe("takeover");
  });

  it("gives way to nutrition-day when both land on the same log", () => {
    const planned = planCelebrationRun([
      celebrationRequestFor(code),
      celebrationRequestFor(scopedCelebrationCode("nutrition-day", "2026-08-12")),
    ]);

    expect(planned.map((request) => [request.code, request.tier])).toEqual([
      [scopedCelebrationCode("nutrition-day", "2026-08-12"), "takeover"],
      [code, "inline"],
    ]);
  });
});
