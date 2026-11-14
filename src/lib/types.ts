export type ActivityLevel =
  | "mostly-sedentary"
  | "lightly-active"
  | "active"
  | "very-active";

export type FitnessExperience =
  | "beginner"
  | "returning"
  | "intermediate"
  | "advanced";

export type CommitmentLevel =
  | "need-a-push"
  | "steady"
  | "locked-in";

export type PrimaryGoal =
  | "lose-weight"
  | "maintain"
  | "build-muscle"
  | "improve-endurance"
  | "target-body-area"
  | "competition-prep";

export type WorkoutEnvironment = "home" | "gym";

export type SubscriptionTier = "starter" | "pro" | "elite";

export type Sex = "female" | "male" | "non-binary" | "prefer-not-to-say";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

/**
 * A weekday, spelled the same way the plan template does so a value can be
 * compared without a case-folding step. Ordered Mon–Sun to match how weeks
 * are drawn in the app.
 */
export type Weekday =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export const WEEKDAYS_IN_ORDER: readonly Weekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type FoodFlags = {
  eatsMeat: boolean;
  eatsDairy: boolean;
  // Separate from eatsMeat so eggetarians see egg-based meals without
  // being served chicken or fish; derived from dietaryPreference.
  eatsEggs: boolean;
};

export type DietaryPreference =
  | "vegetarian"
  | "vegan"
  | "eggetarian"
  | "non-vegetarian";

export type UserProfile = {
  name: string;
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  goalTargetKg?: number;
  goalDurationMonths?: number;
  motivationAnchor?: string;
  appStartedAt?: string;
  activityLevel: ActivityLevel;
  exerciseFrequency: string;
  fitnessExperience: FitnessExperience;
  commitmentLevel: CommitmentLevel;
  primaryGoal: PrimaryGoal;
  secondaryFocus: string;
  workoutEnvironment: WorkoutEnvironment;
  preferredWorkoutDays: number;
  /**
   * Which weekdays the user actually wants to train. When set, the plan lays
   * sessions on exactly these days and everything else becomes a rest day;
   * `preferredWorkoutDays` is kept in sync with the length. Optional so
   * profiles created before this field existed keep the old count-based
   * behavior (a hardcoded per-count split) instead of losing rest days.
   */
  preferredWorkoutWeekdays?: Weekday[];
  preferredWorkoutTime: string;
  equipmentAccess: string[];
  injuries: string[];
  foodFlags: FoodFlags;
  // Optional: profiles created before the diet screen existed never answered, and
  // undefined is the only way to tell "hasn't said" from a real answer -- foodFlags
  // alone defaults to true/true, which is indistinguishable from "eats everything".
  dietaryPreference?: DietaryPreference;
  allergies: string[];
  dislikedFoods: string[];
};

export type MicronutrientTarget = {
  name: string;
  target: number;
  unit: string;
};

export type NutritionSummary = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  fiberG: number;
  micros: Record<string, number>;
};

export type MicronutrientTargets = {
  fiberG: number;
  waterL: number;
  creatineG: number;
  ironMg: number;
  vitaminDMcg: number;
  zincMg: number;
  magnesiumMg: number;
  vitaminB12Mcg: number;
  calciumMg: number;
};

export type NutritionTargets = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  meta: NutritionTargetMeta;
  keyMicros: MicronutrientTarget[];
  micros: MicronutrientTargets;
};

export type NutritionTargetMeta = {
  equation: "mifflin-st-jeor";
  bmrCalories: number;
  tdeeCalories: number;
  activityMultiplier: number;
  calorieAdjustmentPercent: number;
  calorieAdjustment: number;
  proteinGPerKg: number;
  fatPercentOfCalories: number;
};

export type Exercise = {
  id: string;
  name: string;
  type: "warmup" | "strength" | "conditioning" | "mobility";
  environment: Array<WorkoutEnvironment | "both">;
  difficulty: FitnessExperience[];
  equipment: string[];
  focusAreas: string[];
  goalTags: string[];
  contraindications: string[];
  guidance: string;
};

export type WorkoutExerciseCard = {
  id: string;
  name: string;
  type: Exercise["type"];
  reps: string;
  guidance: string;
  emphasis: string;
  reason: string;
  equipment: string[];
};

export type WorkoutSession = {
  id: string;
  dayLabel: string;
  title: string;
  focus: string;
  durationMin: number;
  note: string;
  isRestDay: boolean;
  exercises: WorkoutExerciseCard[];
};

export type WorkoutPlan = {
  weeklyStructure: string;
  dailySessions: WorkoutSession[];
  focusAreas: string[];
  progressionNotes: string[];
};

export type ParsedMealItem = {
  name: string;
  quantity: number;
  unit: string;
  confidence: number;
  nutrition: NutritionSummary;
};

export type MealLog = {
  id: string;
  rawText: string;
  parsedItems: ParsedMealItem[];
  mealType: MealType;
  loggedAt: string;
  estimatedNutrition: NutritionSummary;
  confidence: number;
  coachTip: string;
};

export type WaterLog = {
  date: string;
  amountMl: number;
};

export type WorkoutLog = {
  id: string;
  sessionDate: string;
  sessionId: string;
  exercisesCompleted: string[];
  completedSession: boolean;
  effort: "easy" | "steady" | "push";
  notes: string;
};

export type WorkoutLoadLog = {
  id: string;
  sessionDate: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  reps: number | null;
  loadValue: number;
  loadUnit: string;
  loggedAt: string;
};

export type ReadinessLog = {
  date: string;
  sleepHours: number;
  energyLevel: number;
  muscleSoreness: number;
  // The check-in stopped asking about stress. Logs written before that still
  // carry it, so it stays readable -- it just no longer feeds the score.
  stressLevel?: number;
  loggedAt: string;
};

export type Achievement = {
  code: string;
  label: string;
  description: string;
  unlockedAt: string;
};

export type FoodSource = "dietfit-curated" | "dataset-import" | "external-provider";

export type FoodCatalogItem = {
  id: string;
  name: string;
  aliases: string[];
  source: FoodSource;
  referenceUrl?: string;
  nutritionPer100g: NutritionSummary;
  portions: FoodPortion[];
  tags: string[];
};

export type FoodPortion = {
  label: string;
  quantity: number;
  unit: string;
  grams: number;
  aliases?: string[];
};

export type MealSuggestion = {
  id: string;
  title: string;
  description: string;
  proteinG: number;
  calories: number;
  tags: string[];
};

export type DietTimelineMeal = {
  id: string;
  time: string;
  title: string;
  mealType: MealType;
  quantity: string;
  purpose: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
};

export type OnboardingInput = Omit<UserProfile, "activityLevel" | "appStartedAt">;

export type MealParseResult = {
  parsedItems: ParsedMealItem[];
  estimatedNutrition: NutritionSummary;
  confidence: number;
  unrecognizedSegments: string[];
  coachTip: string;
};

export type WorkoutPreferenceExercise = {
  exerciseId: string;
  title: string;
  type: string;
  reps: string;
  target: string;
  equipment: string;
  guidance: string;
  sessionVideoSrc?: string;
};

export type SavedCustomRoutine = {
  id: string;
  name: string;
  exercises: WorkoutPreferenceExercise[];
};

export type WorkoutPreferences = {
  selectedMuscleFocusByDate: Record<string, string>;
  savedGymRoutinesByFocus: Record<string, WorkoutPreferenceExercise[]>;
  savedGymRoutineNamesByFocus: Record<string, string>;
  savedCustomRoutines: SavedCustomRoutine[];
  selectedCustomRoutineByDate: Record<string, string>;
  draftGymRoutinesByDate: Record<string, WorkoutPreferenceExercise[]>;
  customGymWorkoutsByDate: Record<string, WorkoutPreferenceExercise[]>;
  // Set when someone picks a length in the readiness check-in instead of
  // answering it. Keyed by date, in minutes.
  homeSessionMinutesByDate: Record<string, number>;
  // Marks that today's readiness check has already been surfaced -- whether
  // the user answered, picked a length, or skipped. Prevents the sheet from
  // re-prompting on every session start/resume within the same day.
  dailyReadinessDismissedByDate: Record<string, boolean>;
};

export type ProgressionDecision = "progress" | "hold" | "deload" | "rebuild";

export type WeeklyProgressionSignals = {
  plannedSessions: number;
  completedSessions: number;
  adherence: number;
  averageEffort: number | null;
  loadProgressExercises: string[];
  mealQualityScore: number;
  proteinAdherence: number;
  calorieAdherence: number;
  daysMealsLogged: number;
};

export type WeeklyProgressionReport = {
  weekStartIso: string;
  appliedAtIso: string;
  decision: ProgressionDecision;
  decisionLabel: string;
  coachSummary: string;
  changes: string[];
  signals: WeeklyProgressionSignals;
};

export type ProgressionState = {
  lastAppliedWeekStart: string | null;
  history: WeeklyProgressionReport[];
};

export type ChallengeEnrollment = {
  challengeId: string;
  startedAt: string;
};

export type GoalCycleHardestPart = "diet" | "workouts" | "time" | "motivation";

export type GoalCycleStats = {
  activeDays: number;
  daysMealsLogged: number;
  mealsLogged: number;
  workoutsCompleted: number;
  bestStreak: number;
  adherencePercent: number;
};

// What the user told us at the end of a goal cycle, plus what we already knew.
// The stats are snapshotted rather than recomputed later: logs get merged and
// pruned across devices, so a cycle's numbers have to be frozen when it closes.
export type GoalCycleReview = {
  cycleStartedOn: string;
  cycleEndedOn: string;
  totalDays: number;
  primaryGoal: PrimaryGoal;
  startWeightKg: number;
  goalTargetKg?: number;
  // null when the user skipped the weigh-in -- the one question we cannot
  // answer for them, so "didn't say" has to stay distinguishable from a number.
  endWeightKg: number | null;
  hardestPart: GoalCycleHardestPart | null;
  satisfaction: number | null;
  note: string;
  stoppedReason: string | null;
  wasEngaged: boolean;
  stats: GoalCycleStats;
  completedAt: string;
};

export type CoachMediaAttachment = {
  name: string;
  type: "image" | "video";
  url: string;
};

export type CoachChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sharedContext?: boolean;
  media?: CoachMediaAttachment | null;
};

export type CoachChatThread = {
  id: string;
  title: string;
  createdLabel: string;
  messages: CoachChatMessage[];
};

export type DietFitState = {
  authMode: "demo" | "firebase";
  userEmail: string | null;
  subscriptionTier: SubscriptionTier;
  onboardingCompleted: boolean;
  paywallCompleted: boolean;
  profile: UserProfile | null;
  nutritionTargets: NutritionTargets | null;
  workoutPlan: WorkoutPlan | null;
  coachNote: string;
  mealLogs: MealLog[];
  waterLogs: WaterLog[];
  workoutLogs: WorkoutLog[];
  workoutLoadLogs: WorkoutLoadLog[];
  readinessLogs: ReadinessLog[];
  workoutPreferences: WorkoutPreferences;
  mealSuggestions: MealSuggestion[];
  achievements: Achievement[];
  streak: number;
  points: number;
  progression: ProgressionState;
  // Optional: state persisted before coach history existed will not have it.
  coachThreads?: CoachChatThread[];
  // First-run intro sheet for the Coach tab. Once true it stays true so
  // switching tabs doesn't re-present it; a "What is this?" link inside the
  // chat can reopen the same sheet without touching this flag.
  coachIntroSeen?: boolean;
  challengeEnrollments: ChallengeEnrollment[];
  // Challenge ids this user has ever enrolled in on this account. Used to
  // dedupe the challenge_stats/{id}.participants Firestore counter: only the
  // first enrol per (user, challenge) increments it. Merges across devices
  // via the Firestore state sync. Optional for backwards compat.
  challengesEverEnrolled?: string[];
  // Optional: state persisted before goal cycles could close will not have it.
  goalReviews?: GoalCycleReview[];
  // Celebration codes whose screen has already been presented. Any one-time
  // screen claims a code here instead of growing its own persisted boolean.
  //
  // Undefined is load-bearing: it means "written before this ledger existed"
  // and is what triggers the backfill in deriveState. Do not give it a default
  // in defaultState -- an absent key in stored JSON would then read as an empty
  // ledger, and every milestone the account already earned would queue up as
  // an unseen celebration.
  seenCelebrations?: string[];
  /**
   * @deprecated Superseded by `seenCelebrations` / `CELEBRATION_FIRST_MEAL`.
   * Still read (never written) so a device or remote document that predates the
   * ledger cannot resurrect a celebration it already ran.
   */
  hasSeenFirstMealCelebration?: boolean;
};
