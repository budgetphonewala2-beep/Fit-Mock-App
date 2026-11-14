"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { createFirebaseAuth, createFirebaseDb } from "@/lib/firebase-browser";
import { incrementChallengeParticipants } from "@/lib/challenge-stats";
import {
  FIREBASE_REMOTE_LOAD_TIMEOUT_MS,
  initialRemoteGateState,
  isRemoteGateOpen,
  reduceRemoteGate,
  shouldFetchRemote,
} from "@/lib/firebase-remote-gate";
import {
  achievementContextFromState,
  backfillSeenCelebrations,
  CELEBRATION_GAP_MS,
  celebrationRequestFor,
  enqueueIntoRun,
  mergeSeenCelebrations,
  pendingAchievementCelebrations,
  pendingRepeatableCelebrations,
  pruneSeenCelebrations,
  reconcileAchievements,
  type CelebrationRequest,
} from "@/lib/achievements";
import {
  calculateNutritionTargets,
  calculatePoints,
  calculateStreak,
  createMealLog,
  withStandardWaterTarget,
  formatDietTimelineMealLogText,
  generateDietTimelinePlan,
  generateMealSuggestions,
  getDietTimelineMealNutrition,
  getSessionForDate,
  onboardingToPlan,
} from "@/lib/recommendations";
import { parseMealText } from "@/lib/meal-parser";
import {
  getGoalCycle,
  getHardestPartAdjustment,
  hasReviewedCycle,
  summarizeGoalCycle,
} from "@/lib/goal-cycle";
import {
  defaultProgressionState,
  normalizeProgressionState,
  runWeeklyProgressionCheck,
} from "@/lib/progression";
import { startOfTodayIso } from "@/lib/utils";
import type {
  CoachChatThread,
  DietTimelineMeal,
  DietFitState,
  GoalCycleHardestPart,
  GoalCycleReview,
  MealType,
  MealLog,
  OnboardingInput,
  UserProfile,
  WaterLog,
  WorkoutLoadLog,
  WorkoutLog,
  WorkoutPreferences,
  ReadinessLog,
  SubscriptionTier,
} from "@/lib/types";

const STORAGE_KEY = "dietfit-state";

type DirectMealEntry = Pick<MealLog, "parsedItems" | "estimatedNutrition" | "confidence"> & {
  coachTip?: string;
};

const defaultWorkoutPreferences: WorkoutPreferences = {
  selectedMuscleFocusByDate: {},
  savedGymRoutinesByFocus: {},
  savedGymRoutineNamesByFocus: {},
  savedCustomRoutines: [],
  selectedCustomRoutineByDate: {},
  draftGymRoutinesByDate: {},
  customGymWorkoutsByDate: {},
  homeSessionMinutesByDate: {},
  dailyReadinessDismissedByDate: {},
};

const defaultState: DietFitState = {
  authMode: "demo",
  userEmail: null,
  subscriptionTier: "starter",
  onboardingCompleted: false,
  paywallCompleted: false,
  profile: null,
  nutritionTargets: null,
  workoutPlan: null,
  coachNote: "",
  mealLogs: [],
  waterLogs: [],
  workoutLogs: [],
  workoutLoadLogs: [],
  readinessLogs: [],
  workoutPreferences: defaultWorkoutPreferences,
  mealSuggestions: [],
  achievements: [],
  streak: 0,
  points: 0,
  progression: defaultProgressionState,
  challengeEnrollments: [],
  coachThreads: [],
  goalReviews: [],
  // `seenCelebrations` is deliberately absent. Stored state is loaded as
  // `{ ...defaultState, ...parsed }`, so a default here would mask the "written
  // before the ledger existed" signal that deriveState backfills from.
};

// The whole state blob is re-serialized on every change and pushed to Firebase,
// so transcripts cannot grow without bound. Keep recent conversations only.
const MAX_COACH_THREADS = 20;
const MAX_GOAL_REVIEWS = 12;

type DietFitContextValue = {
  state: DietFitState;
  hydrated: boolean;
  firebaseRemoteLoaded: boolean;
  completeOnboarding: (input: OnboardingInput) => void;
  unlockPaywall: (tier?: SubscriptionTier) => void;
  setSubscriptionTier: (tier: SubscriptionTier) => void;
  logMeal: (
    rawText: string,
    mealType: MealType,
    directEntry?: DirectMealEntry,
  ) => Promise<void>;
  adjustWaterIntake: (deltaMl: number, date?: string) => void;
  toggleExercise: (sessionId: string, exerciseId: string, sessionDate?: string) => void;
  logWorkoutLoad: (input: Omit<WorkoutLoadLog, "id" | "loggedAt">) => void;
  removeWorkoutLoadLog: (input: {
    sessionDate: string;
    sessionId: string;
    exerciseId: string;
    setNumber: number;
  }) => void;
  logDailyReadiness: (
    input: Omit<ReadinessLog, "date" | "loggedAt">,
    date?: string,
  ) => void;
  updateWorkoutPreferences: (
    updater: (preferences: WorkoutPreferences) => WorkoutPreferences,
  ) => void;
  updateCoachThreads: (
    updater: (threads: CoachChatThread[]) => CoachChatThread[],
  ) => void;
  dismissCoachIntro: () => void;
  completeWorkout: (
    sessionId: string,
    allExerciseIds: string[],
    sessionDate?: string,
  ) => void;
  signInDemo: (email?: string) => void;
  signInFirebase: (email?: string | null) => void;
  resetApp: () => void;
  regeneratePlan: () => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  enrollChallenge: (challengeId: string) => void;
  unenrollChallenge: (challengeId: string) => void;
  restartChallenge: (challengeId: string) => void;
  completeGoalCycle: (input: GoalCycleReviewInput) => void;
  startNextGoalCycle: () => void;
  markCelebrationSeen: (code: string) => void;
  /** The one celebration to render right now, or null during the gap. */
  currentCelebration: CelebrationRequest | null;
  enqueueCelebration: (code: string) => void;
  dismissCelebration: () => void;
};

export type GoalCycleReviewInput = {
  endWeightKg: number | null;
  hardestPart: GoalCycleHardestPart | null;
  satisfaction: number | null;
  note: string;
  stoppedReason: string | null;
  startNextCycle: boolean;
};

const DietFitContext = createContext<DietFitContextValue | null>(null);

function buildCoachTip(mealType: MealType, proteinG: number) {
  const proteinSummary =
    proteinG >= 25
      ? "Nice protein hit."
      : "Consider adding a protein anchor like dal, paneer, eggs, tofu, chicken, or curd.";

  return `${mealType[0].toUpperCase()}${mealType.slice(1)} logged. ${proteinSummary}`;
}

function createPlannedMealParsedItem(meal: DietTimelineMeal) {
  return {
    name: meal.title,
    quantity: 1,
    unit: "serving",
    confidence: 1,
    nutrition: getDietTimelineMealNutrition(meal),
  };
}

function normalizePlannedMealLog(log: MealLog, plannedMeals: DietTimelineMeal[]) {
  const matchedMeal = plannedMeals.find(
    (meal) =>
      log.rawText === formatDietTimelineMealLogText(meal) ||
      log.rawText.startsWith(`${meal.title}:`),
  );

  if (!matchedMeal) {
    return log;
  }

  const estimatedNutrition = getDietTimelineMealNutrition(matchedMeal);

  return {
    ...log,
    parsedItems: [createPlannedMealParsedItem(matchedMeal)],
    estimatedNutrition,
    confidence: 1,
    coachTip: buildCoachTip(log.mealType, estimatedNutrition.proteinG),
  };
}

function normalizeLegacyMealLog(log: MealLog) {
  const looksLikePlainSoybean =
    /(soyabean|soybean|soya bean)/i.test(log.rawText) && !/salad/i.test(log.rawText);
  const matchedLegacySoySalad = log.parsedItems.some((item) => item.name === "Soya Bean Salad");

  if (!looksLikePlainSoybean || !matchedLegacySoySalad) {
    return log;
  }

  const reparsed = parseMealText(log.rawText, log.mealType);

  return {
    ...log,
    parsedItems: reparsed.parsedItems,
    estimatedNutrition: reparsed.estimatedNutrition,
    confidence: reparsed.confidence,
    coachTip: reparsed.coachTip,
  };
}

function appendMealLog(previous: DietFitState, args: {
  rawText: string;
  mealType: MealType;
  parsedItems: DietFitState["mealLogs"][number]["parsedItems"];
  estimatedNutrition: DietFitState["mealLogs"][number]["estimatedNutrition"];
  confidence: number;
  coachTip: string;
}) {
  const log = createMealLog(args);

  return deriveState({
    ...previous,
    mealLogs: [log, ...previous.mealLogs],
  });
}

function deriveState(next: DietFitState): DietFitState {
  const recalculatedTargets =
    next.profile &&
    next.nutritionTargets &&
    (!("meta" in next.nutritionTargets) || !("micros" in next.nutritionTargets))
      ? calculateNutritionTargets(next.profile)
      : next.nutritionTargets;
  const normalizedTargets = recalculatedTargets
    ? withStandardWaterTarget(recalculatedTargets)
    : recalculatedTargets;
  const plannedMeals =
    next.profile && normalizedTargets
      ? generateDietTimelinePlan(next.profile, normalizedTargets)
      : null;
  const normalizedMealLogs =
    plannedMeals
      ? next.mealLogs
        .map((log) => normalizePlannedMealLog(log, plannedMeals))
        .map(normalizeLegacyMealLog)
      : next.mealLogs.map(normalizeLegacyMealLog);
  const streak = calculateStreak(
    next.workoutLogs,
    normalizedMealLogs,
    next.workoutLoadLogs,
    next.waterLogs,
    normalizedTargets,
  );
  const points = calculatePoints(next.workoutLogs, normalizedMealLogs);
  const achievements = reconcileAchievements(
    next.achievements,
    achievementContextFromState(
      {
        ...next,
        mealLogs: normalizedMealLogs,
        nutritionTargets: normalizedTargets,
        streak,
      },
      startOfTodayIso(),
    ),
  );

  return {
    ...next,
    subscriptionTier: normalizeSubscriptionTier(next.subscriptionTier),
    mealLogs: normalizedMealLogs,
    nutritionTargets: normalizedTargets,
    workoutPreferences: normalizeWorkoutPreferences(next.workoutPreferences),
    progression: normalizeProgressionState(next.progression),
    streak,
    points,
    achievements,
    // The backfill runs once, on the first derive of state that predates the
    // ledger. After that the array is defined and only `markCelebrationSeen`
    // adds to it -- the prune keeps its date-scoped half from growing forever.
    seenCelebrations: pruneSeenCelebrations(
      next.seenCelebrations ??
        backfillSeenCelebrations({
          achievements,
          hasLoggedMeal: normalizedMealLogs.length > 0,
          hasSeenFirstMealCelebration: next.hasSeenFirstMealCelebration,
        }),
      startOfTodayIso(),
    ),
    mealSuggestions: generateMealSuggestions(
      next.profile,
      normalizedMealLogs,
      normalizedTargets,
    ),
  };
}

function upsertWorkoutLog(workoutLogs: WorkoutLog[], nextLog: WorkoutLog) {
  const existing = workoutLogs.findIndex(
    (log) =>
      log.sessionDate === nextLog.sessionDate && log.sessionId === nextLog.sessionId,
  );

  if (existing === -1) {
    return [nextLog, ...workoutLogs];
  }

  return workoutLogs.map((log, index) => (index === existing ? nextLog : log));
}

function upsertWorkoutLoadLog(
  workoutLoadLogs: WorkoutLoadLog[],
  nextLog: WorkoutLoadLog,
) {
  const existing = workoutLoadLogs.findIndex((log) => log.id === nextLog.id);

  if (existing === -1) {
    return [nextLog, ...workoutLoadLogs];
  }

  return workoutLoadLogs.map((log, index) => (index === existing ? nextLog : log));
}

function upsertReadinessLog(readinessLogs: ReadinessLog[], nextLog: ReadinessLog) {
  const existing = readinessLogs.findIndex((log) => log.date === nextLog.date);

  if (existing === -1) {
    return [nextLog, ...readinessLogs];
  }

  return readinessLogs.map((log, index) => (index === existing ? nextLog : log));
}

function upsertWaterLog(waterLogs: WaterLog[], nextLog: WaterLog) {
  const existing = waterLogs.findIndex((log) => log.date === nextLog.date);

  if (existing === -1) {
    return [nextLog, ...waterLogs];
  }

  return waterLogs.map((log, index) => (index === existing ? nextLog : log));
}

function normalizeWorkoutPreferences(
  preferences: Partial<WorkoutPreferences> | null | undefined,
): WorkoutPreferences {
  return {
    selectedMuscleFocusByDate: preferences?.selectedMuscleFocusByDate ?? {},
    savedGymRoutinesByFocus: preferences?.savedGymRoutinesByFocus ?? {},
    savedGymRoutineNamesByFocus: preferences?.savedGymRoutineNamesByFocus ?? {},
    savedCustomRoutines: preferences?.savedCustomRoutines ?? [],
    selectedCustomRoutineByDate: preferences?.selectedCustomRoutineByDate ?? {},
    draftGymRoutinesByDate: preferences?.draftGymRoutinesByDate ?? {},
    customGymWorkoutsByDate: preferences?.customGymWorkoutsByDate ?? {},
    homeSessionMinutesByDate: preferences?.homeSessionMinutesByDate ?? {},
    dailyReadinessDismissedByDate: preferences?.dailyReadinessDismissedByDate ?? {},
  };
}

function normalizeSubscriptionTier(tier: unknown): SubscriptionTier {
  return tier === "pro" || tier === "elite" ? tier : "starter";
}

function mergeWorkoutPreferences(
  remotePreferences: Partial<WorkoutPreferences> | null | undefined,
  localPreferences: Partial<WorkoutPreferences> | null | undefined,
): WorkoutPreferences {
  const remote = normalizeWorkoutPreferences(remotePreferences);
  const local = normalizeWorkoutPreferences(localPreferences);

  return {
    selectedMuscleFocusByDate: {
      ...remote.selectedMuscleFocusByDate,
      ...local.selectedMuscleFocusByDate,
    },
    savedGymRoutinesByFocus: {
      ...remote.savedGymRoutinesByFocus,
      ...local.savedGymRoutinesByFocus,
    },
    savedGymRoutineNamesByFocus: {
      ...remote.savedGymRoutineNamesByFocus,
      ...local.savedGymRoutineNamesByFocus,
    },
    savedCustomRoutines: mergeUniqueByKey(
      remote.savedCustomRoutines,
      local.savedCustomRoutines,
      (routine) => routine.id,
    ),
    selectedCustomRoutineByDate: {
      ...remote.selectedCustomRoutineByDate,
      ...local.selectedCustomRoutineByDate,
    },
    draftGymRoutinesByDate: {
      ...remote.draftGymRoutinesByDate,
      ...local.draftGymRoutinesByDate,
    },
    customGymWorkoutsByDate: {
      ...remote.customGymWorkoutsByDate,
      ...local.customGymWorkoutsByDate,
    },
    homeSessionMinutesByDate: {
      ...remote.homeSessionMinutesByDate,
      ...local.homeSessionMinutesByDate,
    },
    dailyReadinessDismissedByDate: {
      ...remote.dailyReadinessDismissedByDate,
      ...local.dailyReadinessDismissedByDate,
    },
  };
}

function mergeUniqueByKey<T>(remoteItems: T[], localItems: T[], getKey: (item: T) => string) {
  const localKeys = new Set(localItems.map(getKey));

  return [
    ...localItems,
    ...remoteItems.filter((item) => !localKeys.has(getKey(item))),
  ];
}

function mergeWorkoutLogs(remoteLogs: WorkoutLog[], localLogs: WorkoutLog[]) {
  const byKey = new Map<string, WorkoutLog>();

  [...remoteLogs, ...localLogs].forEach((log) => {
    const key = `${log.sessionDate}:${log.sessionId}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, log);
      return;
    }

    byKey.set(key, {
      ...existing,
      ...log,
      id: existing.id || log.id,
      exercisesCompleted: Array.from(
        new Set([
          ...existing.exercisesCompleted,
          ...log.exercisesCompleted,
        ]),
      ),
      completedSession: existing.completedSession || log.completedSession,
      notes: log.notes || existing.notes,
    });
  });

  return Array.from(byKey.values()).sort((a, b) =>
    b.sessionDate.localeCompare(a.sessionDate),
  );
}

function pickNewerProgression(
  remote: DietFitState["progression"] | undefined,
  local: DietFitState["progression"] | undefined,
) {
  const remoteState = normalizeProgressionState(remote);
  const localState = normalizeProgressionState(local);

  return (localState.lastAppliedWeekStart ?? "") >= (remoteState.lastAppliedWeekStart ?? "")
    ? localState
    : remoteState;
}

function mergeFirebaseState(
  localState: DietFitState,
  remoteState: Partial<DietFitState>,
): DietFitState {
  const remote = deriveState({ ...defaultState, ...remoteState });
  const preferLocalPlan = localState.onboardingCompleted && localState.profile;

  return {
    ...remote,
    ...(preferLocalPlan
      ? {
          onboardingCompleted: localState.onboardingCompleted,
          paywallCompleted: localState.paywallCompleted,
          profile: localState.profile,
          nutritionTargets: localState.nutritionTargets,
          workoutPlan: localState.workoutPlan,
          coachNote: localState.coachNote,
          progression: pickNewerProgression(
            remote.progression,
            localState.progression,
          ),
        }
      : {}),
    authMode: "firebase",
    userEmail: localState.userEmail ?? remote.userEmail,
    subscriptionTier: normalizeSubscriptionTier(
      localState.paywallCompleted ? localState.subscriptionTier : remote.subscriptionTier,
    ),
    mealLogs: mergeUniqueByKey(remote.mealLogs, localState.mealLogs, (log) => log.id),
    waterLogs: mergeUniqueByKey(remote.waterLogs, localState.waterLogs, (log) => log.date),
    workoutLogs: mergeWorkoutLogs(remote.workoutLogs, localState.workoutLogs),
    workoutLoadLogs: mergeUniqueByKey(
      remote.workoutLoadLogs,
      localState.workoutLoadLogs,
      (log) => log.id,
    ),
    readinessLogs: mergeUniqueByKey(
      remote.readinessLogs ?? [],
      localState.readinessLogs ?? [],
      (log) => log.date,
    ),
    workoutPreferences: mergeWorkoutPreferences(
      remote.workoutPreferences,
      localState.workoutPreferences,
    ),
    achievements: mergeUniqueByKey(
      remote.achievements,
      localState.achievements,
      (achievement) => achievement.code,
    ),
    challengeEnrollments: mergeUniqueByKey(
      remote.challengeEnrollments ?? [],
      localState.challengeEnrollments ?? [],
      (e) => e.challengeId,
    ),
    // Union across devices: the global counter dedupe check needs to know
    // "ever enrolled on this account on any device" so a reinstall or a
    // second phone doesn't re-increment on the same user.
    challengesEverEnrolled: Array.from(
      new Set([
        ...(remote.challengesEverEnrolled ?? []),
        ...(localState.challengesEverEnrolled ?? []),
      ]),
    ),
    goalReviews: mergeUniqueByKey(
      remote.goalReviews ?? [],
      localState.goalReviews ?? [],
      (review) => review.cycleStartedOn,
    ).slice(0, MAX_GOAL_REVIEWS),
    // Sticky in both directions: once either device has shown a celebration,
    // a reinstall or a second device must not replay it.
    seenCelebrations: mergeSeenCelebrations(remote, localState),
    hasSeenFirstMealCelebration: Boolean(
      localState.hasSeenFirstMealCelebration || remote.hasSeenFirstMealCelebration,
    ),
    // Without this the remote spread above wins outright, so any conversation
    // started before the first sync landed was destroyed when it arrived.
    coachThreads: mergeUniqueByKey(
      remote.coachThreads ?? [],
      localState.coachThreads ?? [],
      (thread) => thread.id,
    ).slice(0, MAX_COACH_THREADS),
    // The intro's job is over the moment either side has seen it; a second
    // device shouldn't get shown it again.
    coachIntroSeen: Boolean(localState.coachIntroSeen || remote.coachIntroSeen),
  };
}

export function DietFitProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(defaultState);
  const [hydrated, setHydrated] = useState(false);
  // Whether the signed-in user's Firestore state has been fetched (`synced`,
  // which gates saving) and whether the UI may stop waiting for it (the gate,
  // which also opens on a safety timeout). See firebase-remote-gate.ts.
  const [remoteGate, dispatchRemoteGate] = useReducer(reduceRemoteGate, initialRemoteGateState);
  const firebaseUserId = remoteGate.userId;
  const firebaseRemoteLoaded = isRemoteGateOpen(remoteGate);
  const firebaseRemoteSynced = remoteGate.synced;
  const activeFirebaseUserId = useRef<string | null>(null);
  // Presentation state only -- deliberately not persisted. A run belongs to the
  // session it started in; the seen-ledger is what carries across reloads.
  const [celebrationQueue, setCelebrationQueue] = useState<CelebrationRequest[]>([]);
  const [celebrationGateOpen, setCelebrationGateOpen] = useState(true);
  const queuedCelebrationCodesRef = useRef(new Set<string>());
  const takeoverUsedRef = useRef(false);
  // The code actually on screen, as opposed to merely first in the queue.
  const presentedCodeRef = useRef<string | null>(null);
  // Flipped by the first celebration pass after hydration. What "app open"
  // means for milestones that must not interrupt the action that earned them.
  const sessionOpenHandledRef = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored) {
      try {
        setState(deriveState({ ...defaultState, ...JSON.parse(stored) }));
      } catch (error) {
        console.error("Failed to load local DietFit state.", error);
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  // Weekly progression: when a new week starts, analyze last week's workout
  // and meal logs and auto-apply plan adjustments. Runs on app open and
  // whenever the plan/logs land from a remote sync; no-ops once the current
  // week has been processed.
  useEffect(() => {
    if (!hydrated) {
      return;
    }

    setState((previous) => {
      const next = runWeeklyProgressionCheck(previous);

      return next ? deriveState(next) : previous;
    });
  }, [hydrated, firebaseRemoteLoaded, state.onboardingCompleted, state.workoutPlan]);

  useEffect(() => {
    if (
      !hydrated ||
      !firebaseUserId ||
      // Never write until this sign-in's fetch actually finished, even if the
      // UI moved on after the timeout: that would overwrite cloud data.
      !firebaseRemoteSynced ||
      state.authMode !== "firebase" ||
      !state.userEmail
    ) {
      return;
    }

    const db = createFirebaseDb();

    if (!db) {
      return;
    }

    const userId = firebaseUserId;
    const timeout = window.setTimeout(() => {
      const stateToSave = JSON.parse(JSON.stringify(state)) as DietFitState;

      void setDoc(
        doc(db, "users", userId),
        {
          state: stateToSave,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).catch((error) => {
        console.error("Failed to save DietFit Firebase state.", error);
      });
    }, 600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [firebaseRemoteSynced, firebaseUserId, hydrated, state]);

  useEffect(() => {
    const auth = createFirebaseAuth();

    if (!auth) {
      dispatchRemoteGate({ type: "auth-changed", userId: null });
      return;
    }

    return onAuthStateChanged(auth, (user) => {
      activeFirebaseUserId.current = user?.uid ?? null;
      dispatchRemoteGate({ type: "auth-changed", userId: user?.uid ?? null });

      if (!user?.email) {
        return;
      }

      setState((previous) =>
        deriveState({
          ...previous,
          authMode: "firebase",
          userEmail: user.email,
        }),
      );
    });
  }, []);

  useEffect(() => {
    if (!hydrated || !firebaseUserId || !shouldFetchRemote(remoteGate)) {
      return;
    }

    let ignore = false;
    const userId = firebaseUserId;
    const syncRequest = remoteGate.syncRequest;
    const finish = () =>
      dispatchRemoteGate({ type: "sync-finished", userId, syncRequest });

    async function syncFirebaseState() {
      const db = createFirebaseDb();

      if (!db) {
        finish();
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "users", userId));

        if (ignore || activeFirebaseUserId.current !== userId) {
          return;
        }

        if (snapshot.exists()) {
          const remoteState = snapshot.data().state as Partial<DietFitState> | undefined;

          if (remoteState) {
            setState((previous) =>
              deriveState(mergeFirebaseState(previous, remoteState)),
            );
          }
        }
      } catch (error) {
        console.error("Failed to load DietFit Firebase state.", error);
      } finally {
        if (!ignore && activeFirebaseUserId.current === userId) {
          finish();
        }
      }
    }

    void syncFirebaseState();

    return () => {
      ignore = true;
    };
    // Keyed on the sync request, not just the user, so signing in again as
    // the same user fetches again (Firebase sends no auth event for that).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUserId, hydrated, remoteGate.syncRequest]);

  // Safety net: if the fetch for this sign-in never settles (a stalled
  // Firestore connection in the WebView, say), stop holding the UI after a
  // while. Saving stays off until a fetch really finishes.
  useEffect(() => {
    if (!firebaseUserId || isRemoteGateOpen(remoteGate)) {
      return;
    }
    const syncRequest = remoteGate.syncRequest;
    const timer = window.setTimeout(() => {
      dispatchRemoteGate({ type: "timed-out", syncRequest });
    }, FIREBASE_REMOTE_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [firebaseUserId, remoteGate]);

  const completeOnboarding = (input: OnboardingInput) => {
    const nextPlan = onboardingToPlan(input);

    setState((previous) =>
      deriveState({
        ...previous,
        ...nextPlan,
        profile: nextPlan.profile
          ? {
              ...nextPlan.profile,
              appStartedAt: previous.profile?.appStartedAt ?? startOfTodayIso(),
            }
          : nextPlan.profile,
        onboardingCompleted: true,
        paywallCompleted: false,
        userEmail: previous.userEmail ?? "demo@fitmonk.app",
      }),
    );
  };

  const unlockPaywall = (tier: SubscriptionTier = "starter") => {
    setState((previous) =>
      deriveState({
        ...previous,
        paywallCompleted: true,
        subscriptionTier: tier,
      }),
    );
  };

  const setSubscriptionTier = (tier: SubscriptionTier) => {
    setState((previous) =>
      deriveState({
        ...previous,
        subscriptionTier: tier,
      }),
    );
  };

  const logMeal = async (
    rawText: string,
    mealType: MealType,
    directEntry?: DirectMealEntry,
  ): Promise<void> => {
    if (directEntry) {
      setState((previous) =>
        appendMealLog(previous, {
          rawText,
          mealType,
          parsedItems: directEntry.parsedItems,
          estimatedNutrition: directEntry.estimatedNutrition,
          confidence: directEntry.confidence,
          coachTip:
            directEntry.coachTip ??
            buildCoachTip(mealType, directEntry.estimatedNutrition.proteinG),
        }),
      );

      return;
    }

    {
      try {
        const response = await fetch("/api/meal", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rawText,
            mealType,
          }),
        });

        if (!response.ok) {
          throw new Error(`Meal parsing failed with status ${response.status}.`);
        }

        const parsed = await response.json();

        setState((previous) =>
          appendMealLog(previous, {
            rawText,
            mealType,
            parsedItems: parsed.parsedItems,
            estimatedNutrition: parsed.estimatedNutrition,
            confidence: parsed.confidence,
            coachTip: parsed.coachTip,
          }),
        );
      } catch (error) {
        console.error("Falling back to local meal parser.", error);

        setState((previous) => {
          const parsed = parseMealText(rawText, mealType);

          return appendMealLog(previous, {
            rawText,
            mealType,
            parsedItems: parsed.parsedItems,
            estimatedNutrition: parsed.estimatedNutrition,
            confidence: parsed.confidence,
            coachTip: parsed.coachTip,
          });
        });
      }
    }
  };

  const adjustWaterIntake = (deltaMl: number, date = startOfTodayIso()) => {
    setState((previous) => {
      const existing = previous.waterLogs.find((log) => log.date === date);
      const nextAmount = Math.max(0, (existing?.amountMl ?? 0) + deltaMl);

      return deriveState({
        ...previous,
        waterLogs: upsertWaterLog(previous.waterLogs, {
          date,
          amountMl: nextAmount,
        }),
      });
    });
  };

  const toggleExercise = (
    sessionId: string,
    exerciseId: string,
    sessionDate = startOfTodayIso(),
  ) => {
    setState((previous) => {
      const existing = previous.workoutLogs.find(
        (log) => log.sessionDate === sessionDate && log.sessionId === sessionId,
      );

      const exercisesCompleted = existing?.exercisesCompleted.includes(exerciseId)
        ? existing.exercisesCompleted.filter((id) => id !== exerciseId)
        : [...(existing?.exercisesCompleted ?? []), exerciseId];
      const session = previous.workoutPlan
        ? getSessionForDate(previous.workoutPlan, sessionDate)
        : null;
      const nextLog: WorkoutLog = {
        id: existing?.id ?? `${sessionId}-${sessionDate}`,
        sessionDate,
        sessionId,
        exercisesCompleted,
        completedSession:
          session !== null && exercisesCompleted.length >= session.exercises.length,
        effort: existing?.effort ?? "steady",
        notes: existing?.notes ?? "Completed from the Today flow.",
      };

      return deriveState({
        ...previous,
        workoutLogs: upsertWorkoutLog(previous.workoutLogs, nextLog),
      });
    });
  };

  const logWorkoutLoad = (input: Omit<WorkoutLoadLog, "id" | "loggedAt">) => {
    setState((previous) => {
      const loggedAt = new Date().toISOString();
      const id = [
        input.sessionDate,
        input.sessionId,
        input.exerciseId,
        input.setNumber,
      ].join("-");

      return deriveState({
        ...previous,
        workoutLoadLogs: upsertWorkoutLoadLog(previous.workoutLoadLogs ?? [], {
          ...input,
          id,
          loggedAt,
        }),
      });
    });
  };

  const removeWorkoutLoadLog = (input: {
    sessionDate: string;
    sessionId: string;
    exerciseId: string;
    setNumber: number;
  }) => {
    setState((previous) => {
      const matchesExercise = (log: WorkoutLoadLog) =>
        log.sessionDate === input.sessionDate &&
        log.exerciseId === input.exerciseId &&
        (!input.sessionId || !log.sessionId || log.sessionId === input.sessionId);

      return deriveState({
        ...previous,
        workoutLoadLogs: (previous.workoutLoadLogs ?? [])
          .filter((log) => !(matchesExercise(log) && log.setNumber === input.setNumber))
          .map((log) =>
            matchesExercise(log) && log.setNumber > input.setNumber
              ? {
                  ...log,
                  setNumber: log.setNumber - 1,
                  id: [
                    log.sessionDate,
                    log.sessionId,
                    log.exerciseId,
                    log.setNumber - 1,
                  ].join("-"),
                }
              : log,
          ),
      });
    });
  };

  const updateWorkoutPreferences = (
    updater: (preferences: WorkoutPreferences) => WorkoutPreferences,
  ) => {
    setState((previous) =>
      deriveState({
        ...previous,
        workoutPreferences: normalizeWorkoutPreferences(
          updater(normalizeWorkoutPreferences(previous.workoutPreferences)),
        ),
      }),
    );
  };

  const updateCoachThreads = (
    updater: (threads: CoachChatThread[]) => CoachChatThread[],
  ) => {
    setState((previous) =>
      deriveState({
        ...previous,
        coachThreads: updater(previous.coachThreads ?? []).slice(0, MAX_COACH_THREADS),
      }),
    );
  };

  const dismissCoachIntro = () => {
    setState((previous) =>
      previous.coachIntroSeen
        ? previous
        : deriveState({ ...previous, coachIntroSeen: true }),
    );
  };

  const logDailyReadiness = (
    input: Omit<ReadinessLog, "date" | "loggedAt">,
    date = startOfTodayIso(),
  ) => {
    setState((previous) =>
      deriveState({
        ...previous,
        readinessLogs: upsertReadinessLog(previous.readinessLogs ?? [], {
          ...input,
          date,
          loggedAt: new Date().toISOString(),
        }),
      }),
    );
  };

  const completeWorkout = (
    sessionId: string,
    allExerciseIds: string[],
    sessionDate = startOfTodayIso(),
  ) => {
    setState((previous) => {
      const existing = previous.workoutLogs.find(
        (log) => log.sessionDate === sessionDate && log.sessionId === sessionId,
      );

      return deriveState({
        ...previous,
        workoutLogs: upsertWorkoutLog(previous.workoutLogs, {
          id: existing?.id ?? `${sessionId}-${sessionDate}`,
          sessionDate,
          sessionId,
          exercisesCompleted: allExerciseIds,
          completedSession: true,
          effort: existing?.effort ?? "push",
          notes: "Session marked complete.",
        }),
      });
    });
  };

  const signInDemo = (email = "demo@fitmonk.app") => {
    setState((previous) =>
      deriveState({
        ...previous,
        authMode: "demo",
        userEmail: email,
      }),
    );
  };

  const signInFirebase = (email?: string | null) => {
    // A returning user has state in Firestore that we haven't fetched yet.
    // Ask for a fresh fetch so route gates (the (app) layout, /onboarding)
    // hold until it's merged, instead of racing on the fresh local state
    // (which still reports onboardingCompleted=false and would bounce a
    // returning user through onboarding again). This has to request the
    // fetch itself: when the same user signs in again, Firebase sends no
    // auth-state event, and waiting on one left the app on the loader.
    dispatchRemoteGate({ type: "signed-in" });
    setState((previous) =>
      deriveState({
        ...previous,
        authMode: "firebase",
        userEmail: email ?? previous.userEmail ?? "firebase@fitmonk.app",
      }),
    );
  };

  const resetApp = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(defaultState);
  };

  const regeneratePlan = () => {
    setState((previous) => {
      if (!previous.profile) {
        return previous;
      }

      const nextPlan = onboardingToPlan(previous.profile);
      return deriveState({
        ...previous,
        ...nextPlan,
        profile: nextPlan.profile
          ? {
              ...nextPlan.profile,
              appStartedAt: previous.profile.appStartedAt ?? startOfTodayIso(),
            }
          : nextPlan.profile,
      });
    });
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    setState((previous) => {
      if (!previous.profile) {
        return previous;
      }

      const nextProfile: UserProfile = {
        ...previous.profile,
        ...updates,
      };
      // Weekday picks drive the day count downstream (duration formulas,
      // "N sessions per week" copy). Keep them in lockstep so a user who
      // picks four weekdays doesn't still see "5 sessions per week".
      if (nextProfile.preferredWorkoutWeekdays !== undefined) {
        nextProfile.preferredWorkoutDays = Math.max(
          1,
          nextProfile.preferredWorkoutWeekdays.length,
        );
      }
      const nextPlan = onboardingToPlan(nextProfile);

      return deriveState({
        ...previous,
        ...nextPlan,
        profile: nextPlan.profile
          ? {
              ...nextPlan.profile,
              appStartedAt: previous.profile.appStartedAt ?? startOfTodayIso(),
            }
          : nextPlan.profile,
      });
    });
  };

  const enrollChallenge = (challengeId: string) => {
    let shouldIncrementCounter = false;
    setState((previous) => {
      if (previous.challengeEnrollments.some((e) => e.challengeId === challengeId)) {
        return previous;
      }
      const everEnrolled = previous.challengesEverEnrolled ?? [];
      shouldIncrementCounter = !everEnrolled.includes(challengeId);
      return {
        ...previous,
        challengeEnrollments: [
          ...previous.challengeEnrollments,
          { challengeId, startedAt: startOfTodayIso() },
        ],
        challengesEverEnrolled: shouldIncrementCounter
          ? [...everEnrolled, challengeId]
          : everEnrolled,
      };
    });
    // Fire-and-forget: the public participant counter in Firestore only
    // climbs the first time this account enrolls in this challenge. A
    // failed write silently falls back to the seeded floor in the UI.
    if (shouldIncrementCounter) {
      void incrementChallengeParticipants(challengeId);
    }
  };

  const unenrollChallenge = (challengeId: string) => {
    setState((previous) => ({
      ...previous,
      challengeEnrollments: previous.challengeEnrollments.filter(
        (e) => e.challengeId !== challengeId,
      ),
    }));
  };

  const restartChallenge = (challengeId: string) => {
    setState((previous) => ({
      ...previous,
      challengeEnrollments: previous.challengeEnrollments.map((e) =>
        e.challengeId === challengeId ? { ...e, startedAt: startOfTodayIso() } : e,
      ),
    }));
  };

  // Rebuilds the plan around today so the next cycle starts from day 1. The
  // profile edits are applied first, since the plan is generated from them.
  const rebuildPlanForNewCycle = (
    previous: DietFitState,
    profileUpdates: Partial<UserProfile>,
  ) => {
    if (!previous.profile) {
      return previous;
    }

    const today = startOfTodayIso();
    const nextPlan = onboardingToPlan({ ...previous.profile, ...profileUpdates });

    return {
      ...previous,
      ...nextPlan,
      profile: nextPlan.profile
        ? { ...nextPlan.profile, appStartedAt: today }
        : previous.profile,
    };
  };

  const completeGoalCycle = (input: GoalCycleReviewInput) => {
    setState((previous) => {
      const profile = previous.profile;

      if (!profile) {
        return previous;
      }

      const today = startOfTodayIso();
      const cycle = getGoalCycle(profile, today);

      // A cycle closes once. Two taps on the finish button, or a second device
      // syncing the same answers back, must not stack up duplicate reviews.
      if (hasReviewedCycle(previous, cycle)) {
        return previous;
      }

      const summary = summarizeGoalCycle(previous, cycle, today);
      const review: GoalCycleReview = {
        cycleStartedOn: cycle.startedOn,
        cycleEndedOn: cycle.endsOn,
        totalDays: cycle.totalDays,
        primaryGoal: profile.primaryGoal,
        startWeightKg: profile.weightKg,
        goalTargetKg: profile.goalTargetKg,
        endWeightKg: input.endWeightKg,
        hardestPart: input.hardestPart,
        satisfaction: input.satisfaction,
        note: input.note.trim(),
        stoppedReason: input.stoppedReason,
        wasEngaged: summary.wasEngaged,
        stats: {
          activeDays: summary.activeDays,
          daysMealsLogged: summary.daysMealsLogged,
          mealsLogged: summary.mealsLogged,
          workoutsCompleted: summary.workoutsCompleted,
          bestStreak: summary.bestStreak,
          adherencePercent: summary.adherencePercent,
        },
        completedAt: new Date().toISOString(),
      };

      const withReview: DietFitState = {
        ...previous,
        goalReviews: [review, ...(previous.goalReviews ?? [])].slice(0, MAX_GOAL_REVIEWS),
      };

      if (!input.startNextCycle) {
        return deriveState(withReview);
      }

      return deriveState(
        rebuildPlanForNewCycle(withReview, {
          ...getHardestPartAdjustment(profile, input.hardestPart).changes,
          ...(input.endWeightKg !== null ? { weightKg: input.endWeightKg } : {}),
        }),
      );
    });
  };

  const startNextGoalCycle = () => {
    setState((previous) =>
      previous.profile ? deriveState(rebuildPlanForNewCycle(previous, {})) : previous,
    );
  };

  // Call the moment a celebration is presented, not when it is dismissed, so
  // a reload mid-celebration cannot replay a once-per-account moment.
  const markCelebrationSeen = useCallback((code: string) => {
    setState((previous) =>
      (previous.seenCelebrations ?? []).includes(code)
        ? previous
        : {
            ...previous,
            seenCelebrations: [...(previous.seenCelebrations ?? []), code],
          },
    );
  }, []);

  /**
   * Adds a celebration to the run. Safe to call repeatedly -- a code is only
   * ever queued once per session, which is what lets callers fire it from an
   * effect without tracking whether they already did.
   */
  const enqueueCelebration = useCallback((code: string) => {
    if (queuedCelebrationCodesRef.current.has(code)) {
      return;
    }

    queuedCelebrationCodesRef.current.add(code);

    setCelebrationQueue((queue) =>
      enqueueIntoRun(queue, celebrationRequestFor(code), {
        presentedCode: presentedCodeRef.current,
        takeoverAvailable: !takeoverUsedRef.current,
      }),
    );
  }, []);

  const currentCelebration = celebrationGateOpen ? (celebrationQueue[0] ?? null) : null;

  // Ledger unlocks and standing repeatable wins queue themselves. Badge-tier
  // milestones stay pending on purpose: the gallery reads them to mark an entry
  // unseen.
  useEffect(() => {
    if (!hydrated) {
      return;
    }

    // True only for the first pass after the app opens. Streak milestones are
    // `next-open`, so this is what keeps one from landing on top of the very
    // meal or set that earned it -- it waits for the user to come back.
    const atSessionOpen = !sessionOpenHandledRef.current;
    sessionOpenHandledRef.current = true;

    const codes = [
      ...pendingAchievementCelebrations(state.achievements, state.seenCelebrations).map(
        (achievement) => achievement.code,
      ),
      ...pendingRepeatableCelebrations(
        achievementContextFromState(state, startOfTodayIso()),
        state.seenCelebrations,
        { atSessionOpen },
      ),
    ];

    for (const code of codes) {
      if (celebrationRequestFor(code).tier !== "badge") {
        enqueueCelebration(code);
      }
    }
  }, [hydrated, state, enqueueCelebration]);

  // Presenting is what claims the code, so a reload mid-run resumes at the
  // next celebration rather than replaying the one already shown.
  useEffect(() => {
    if (!currentCelebration) {
      return;
    }

    if (currentCelebration.tier === "takeover") {
      takeoverUsedRef.current = true;
    }

    presentedCodeRef.current = currentCelebration.code;
    markCelebrationSeen(currentCelebration.code);
  }, [currentCelebration, markCelebrationSeen]);

  const dismissCelebration = useCallback(() => {
    setCelebrationQueue((queue) => queue.slice(1));
    setCelebrationGateOpen(false);
  }, []);

  // The gap runs between celebrations, never before the first one.
  useEffect(() => {
    if (celebrationGateOpen) {
      return;
    }

    const timer = window.setTimeout(() => setCelebrationGateOpen(true), CELEBRATION_GAP_MS);

    return () => window.clearTimeout(timer);
  }, [celebrationGateOpen]);

  return (
    <DietFitContext.Provider
      value={{
        state,
        hydrated,
        firebaseRemoteLoaded,
        completeOnboarding,
        unlockPaywall,
        setSubscriptionTier,
        logMeal,
        adjustWaterIntake,
        toggleExercise,
        logWorkoutLoad,
        removeWorkoutLoadLog,
        logDailyReadiness,
        updateWorkoutPreferences,
        updateCoachThreads,
        dismissCoachIntro,
        completeWorkout,
        signInDemo,
        signInFirebase,
        resetApp,
        regeneratePlan,
        updateProfile,
        enrollChallenge,
        unenrollChallenge,
        restartChallenge,
        completeGoalCycle,
        startNextGoalCycle,
        markCelebrationSeen,
        currentCelebration,
        enqueueCelebration,
        dismissCelebration,
      }}
    >
      {children}
    </DietFitContext.Provider>
  );
}

export function useDietFit() {
  const context = useContext(DietFitContext);

  if (!context) {
    throw new Error("useDietFit must be used within DietFitProvider");
  }

  return context;
}
