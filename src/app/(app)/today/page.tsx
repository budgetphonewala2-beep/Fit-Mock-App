"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Battery, Info, Salad, TrendingUp, Trophy, X } from "lucide-react";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  calculateWorkoutCompletion,
  getGoalCalculationDetails,
  getGoalSummary,
  getDisplaySessionNote,
  getNutritionForDate,
  getTodaysSession,
} from "@/lib/recommendations";
import {
  getAdaptedWorkoutSession,
  getReadinessWorkoutAdjustment,
  getReadinessForDate,
} from "@/lib/readiness";
import { getActiveProgressionReport } from "@/lib/progression";
import {
  celebrationRequestFor,
  pendingAchievementCelebrations,
} from "@/lib/achievements";
import { isProTier, startOfTodayIso } from "@/lib/utils";
import type { Achievement } from "@/lib/types";

function formatGoalValue(value: number, unit: string) {
  if (unit === "L") {
    return `${value.toFixed(1)}${unit}`;
  }

  if (unit === "mcg" && value < 10) {
    return `${value.toFixed(1)}${unit}`;
  }

  return `${Math.round(value * 10) / 10}${unit}`;
}

function NutrientGoalTile({
  current,
  label,
  target,
  unit,
}: {
  current: number;
  label: string;
  target: number;
  unit: string;
}) {
  const progress = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;

  return (
    <div className="rounded-tile bg-primary/5 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-[11px] font-semibold text-muted">
          {formatGoalValue(current, unit)} / {formatGoalValue(target, unit)}
        </span>
      </div>
      <ProgressBar className="mt-2" value={progress} />
    </div>
  );
}

/**
 * The badge tier's only announcement: a dot in the gallery.
 *
 * Rendered inside the hydrated tree, so the unseen set can be frozen on mount
 * and the codes claimed straight away -- the dots hold still while the user
 * reads them and are gone on the next visit. Only badge-tier codes are claimed
 * here: claiming a pending takeover would silently swallow its screen.
 */
function AchievementsCard({
  achievements,
  seenCelebrations,
}: {
  achievements: Achievement[];
  seenCelebrations: string[] | undefined;
}) {
  const { markCelebrationSeen } = useDietFit();
  const [unseen] = useState(
    () =>
      new Set(
        pendingAchievementCelebrations(achievements, seenCelebrations)
          .map((achievement) => achievement.code)
          .filter((code) => celebrationRequestFor(code).tier === "badge"),
      ),
  );

  useEffect(() => {
    unseen.forEach(markCelebrationSeen);
  }, [unseen, markCelebrationSeen]);

  return (
    <Card className="rounded-hero">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary/70">
        Achievements
      </p>
      <div className="mt-4 grid gap-3">
        {achievements.length === 0 ? (
          <div className="rounded-card bg-white/75 p-4 text-sm text-muted">
            Your first wins unlock here after you log meals and complete workouts.
          </div>
        ) : (
          achievements.map((achievement) => (
            <div key={achievement.code} className="rounded-card bg-accent-soft/60 p-4">
              <div className="flex items-center gap-2">
                <div className="text-lg font-semibold">{achievement.label}</div>
                {unseen.has(achievement.code) && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-accent"
                    aria-label="New"
                  />
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{achievement.description}</p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

export default function TodayPage() {
  const { state, hydrated } = useDietFit();
  const [goalInfoOpen, setGoalInfoOpen] = useState(false);
  const baseTodaySession = getTodaysSession(state.workoutPlan);
  const todayIso = startOfTodayIso();
  const todayNutrition = getNutritionForDate(state.mealLogs, todayIso);
  const todayReadiness = getReadinessForDate(state.readinessLogs, todayIso);
  const progressionReport = getActiveProgressionReport(state.progression, todayIso);
  const readinessAdjustment = todayReadiness
    ? getReadinessWorkoutAdjustment(todayReadiness)
    : null;
  const todaySession = getAdaptedWorkoutSession({
    environment: state.profile?.workoutEnvironment,
    readinessLog: todayReadiness,
    session: baseTodaySession,
    subscriptionTier: state.subscriptionTier,
  });
  const workoutProgress = calculateWorkoutCompletion(
    todaySession?.id ?? null,
    state.workoutLogs,
    todaySession?.exercises.length ?? 0,
  );

  if (!hydrated) {
    return <Card className="rounded-hero">Loading your rhythm...</Card>;
  }

  if (!state.onboardingCompleted || !state.profile || !state.nutritionTargets) {
    return (
      <Card className="rounded-hero">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary/70">
          Start here
        </p>
        <h2 className="mt-3 text-3xl font-semibold">Finish onboarding to unlock your plan.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Fitmonk uses your goals, exercise habits, injuries, and food preferences
          to build a practical workout and nutrition setup that feels personal from day one.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/onboarding"
            className="inline-flex items-center rounded-full bg-primary px-5 py-3 font-semibold text-white"
          >
            Begin onboarding
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center rounded-full border border-border bg-white/75 px-5 py-3 font-semibold"
          >
            Sign in
          </Link>
        </div>
      </Card>
    );
  }

  const sessionNote = getDisplaySessionNote(todaySession?.note);
  const goalSummary = getGoalSummary(state.profile);
  const goalDetails = getGoalCalculationDetails(state.profile);
  const calorieAdjustmentText =
    state.nutritionTargets.meta.calorieAdjustment === 0
      ? "no calorie adjustment"
      : `${state.nutritionTargets.meta.calorieAdjustment > 0 ? "+" : ""}${state.nutritionTargets.meta.calorieAdjustment} kcal/day`;
  const micros = state.nutritionTargets.micros;
  const nutrientGoals = [
    { label: "Calories", current: todayNutrition.calories, target: state.nutritionTargets.calories, unit: "kcal" },
    { label: "Protein", current: todayNutrition.proteinG, target: state.nutritionTargets.proteinG, unit: "g" },
    { label: "Carbs", current: todayNutrition.carbsG, target: state.nutritionTargets.carbsG, unit: "g" },
    { label: "Fats", current: todayNutrition.fatsG, target: state.nutritionTargets.fatsG, unit: "g" },
    { label: "Fiber", current: todayNutrition.fiberG, target: micros.fiberG, unit: "g" },
    { label: "Water", current: 0, target: micros.waterL, unit: "L" },
    { label: "Iron", current: todayNutrition.micros.iron ?? 0, target: micros.ironMg, unit: "mg" },
    { label: "B12", current: todayNutrition.micros.vitaminB12 ?? 0, target: micros.vitaminB12Mcg, unit: "mcg" },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="grid gap-4">
        <Card className="rounded-hero bg-gradient-to-br from-white via-white/90 to-primary/8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">
            Welcome back
          </p>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-4xl font-semibold text-balance">
                {state.profile.name}, today is about clean reps and easy wins.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                {state.coachNote}
              </p>
            </div>
            <div className="rounded-card bg-accent-soft px-4 py-3 text-right">
              <div className="text-sm text-muted">Current streak</div>
              <div className="text-3xl font-semibold text-accent">{state.streak}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-card bg-white/90 p-4 md:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-muted">Today&apos;s Goal</div>
                  <div className="mt-1 text-xs text-muted">
                    Daily nutrient targets tuned to your saved fitness goal
                  </div>
                </div>
                <button
                  type="button"
                  aria-expanded={goalInfoOpen}
                  aria-label="See how today's goal is calculated"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-black/8 bg-white text-foreground/45 transition hover:border-black/15 hover:text-foreground/70"
                  onClick={() => setGoalInfoOpen(true)}
                >
                  <Info className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {nutrientGoals.map((goal) => (
                  <NutrientGoalTile
                    key={goal.label}
                    current={goal.current}
                    label={goal.label}
                    target={goal.target}
                    unit={goal.unit}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-card bg-white/90 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted">
                <Trophy className="h-4 w-4 text-primary" />
                Points
              </div>
              <div className="mt-3 text-3xl font-semibold">{state.points}</div>
              <p className="mt-3 text-sm text-muted">
                Lightweight rewards for logging meals and completing sessions.
              </p>
            </div>
          </div>
        </Card>

        {progressionReport ? (
          <Card className="rounded-hero border border-primary/15 bg-primary/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary/70">
                  This week&apos;s plan update
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {progressionReport.decisionLabel}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              {progressionReport.coachSummary}
            </p>
            {progressionReport.changes.length > 0 ? (
              <ul className="mt-3 grid gap-2">
                {progressionReport.changes.map((change) => (
                  <li
                    key={change}
                    className="rounded-tile bg-white/80 px-4 py-2.5 text-sm text-foreground"
                  >
                    {change}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-xs text-muted">
              Based on last week: {progressionReport.signals.completedSessions}/
              {progressionReport.signals.plannedSessions} sessions completed, meal quality{" "}
              {progressionReport.signals.mealQualityScore}/100.
            </p>
          </Card>
        ) : null}

        <Card className="rounded-hero">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary/70">
                Today&apos;s workout
              </p>
              <h2 className="mt-2 text-3xl font-semibold">
                {todaySession?.title ?? "Your next session"}
              </h2>
            </div>
            <Link
              href="/workout"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Open workout
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {sessionNote ? <p className="mt-3 text-sm text-muted">{sessionNote}</p> : null}
          {todayReadiness && readinessAdjustment && state.profile?.workoutEnvironment === "home" ? (
            <div className="mt-4 rounded-card border border-primary/12 bg-white/80 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Battery className="h-4 w-4" />
                    {isProTier(state.subscriptionTier)
                      ? readinessAdjustment.label
                      : "Pro preview"}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {isProTier(state.subscriptionTier)
                      ? readinessAdjustment.summary
                      : readinessAdjustment.proPreviewSummary}
                  </p>
                </div>
                <div className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                  {readinessAdjustment.score}/100
                </div>
              </div>
              <div className="mt-3 rounded-tile bg-primary/6 px-3 py-2 text-xs font-semibold text-primary">
                {isProTier(state.subscriptionTier)
                  ? `${todaySession?.durationMin ?? 30} min adaptive workout active`
                  : "Upgrade to Pro to apply this adjustment to today’s workout"}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-muted md:grid-cols-4">
                <span>Sleep {todayReadiness.sleepHours}h</span>
                <span>Energy {todayReadiness.energyLevel}/10</span>
                <span>Soreness {todayReadiness.muscleSoreness}/10</span>
                {todayReadiness.stressLevel != null ? (
                  <span>Stress {todayReadiness.stressLevel}/10</span>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="mt-5 rounded-card bg-primary/7 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-muted">Completion today</div>
              <div className="text-sm font-semibold text-primary">
                {Math.round(workoutProgress * 100)}%
              </div>
            </div>
            <ProgressBar className="mt-3" value={workoutProgress * 100} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {todaySession?.exercises.map((exercise) => (
              <div key={exercise.id} className="rounded-card border border-border bg-white/75 p-4">
                <div className="text-sm font-semibold text-primary">{exercise.emphasis}</div>
                <div className="mt-1 text-xl font-semibold">{exercise.name}</div>
                <div className="mt-1 text-sm text-muted">{exercise.reps}</div>
                <p className="mt-2 text-sm leading-6 text-muted">{exercise.reason}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card className="rounded-hero">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.22em] text-primary/70">
            <Salad className="h-4 w-4" />
            Suggested meals
          </div>
          <div className="mt-4 grid gap-3">
            {state.mealSuggestions.map((suggestion) => (
              <div key={suggestion.id} className="rounded-card bg-white/75 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-lg font-semibold">{suggestion.title}</div>
                  <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {suggestion.proteinG}g protein
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {suggestion.description}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <AchievementsCard
          achievements={state.achievements}
          seenCelebrations={state.seenCelebrations}
        />
      </div>

      {goalInfoOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/28 px-4 backdrop-blur-sm"
          onClick={() => setGoalInfoOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-hero border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,252,0.97),rgba(245,241,232,0.94))] p-5 shadow-[0_24px_60px_rgba(12,39,35,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
                  Today&apos;s Goal
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">
                  {goalSummary.headline}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close today's goal explanation"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-black/8 bg-white/80 text-foreground/50 transition hover:border-black/15 hover:text-foreground/80"
                onClick={() => setGoalInfoOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {goalDetails.paceKgPerWeek !== null && goalDetails.durationMonths !== null ? (
              <p className="mt-4 text-[12px] leading-5 text-foreground/70">
                Pace target: {goalDetails.paceKgPerWeek} kg/week over about {goalDetails.durationMonths} months.
              </p>
            ) : null}

            <p className="mt-3 text-[12px] leading-5 text-foreground/70">
              We estimate your baseline with the Mifflin-St Jeor equation, then apply your activity multiplier of {state.nutritionTargets.meta.activityMultiplier} to reach about {state.nutritionTargets.meta.tdeeCalories} kcal/day before goal adjustment.
            </p>

            <p className="mt-3 text-[12px] leading-5 text-foreground/70">
              From there we apply a {state.nutritionTargets.meta.calorieAdjustmentPercent > 0 ? "+" : ""}{state.nutritionTargets.meta.calorieAdjustmentPercent}% goal adjustment, which works out to {calorieAdjustmentText}.
            </p>

            <p className="mt-3 text-[12px] leading-5 text-foreground/70">
              Macros are then built by setting protein at {state.nutritionTargets.meta.proteinGPerKg} g/kg, fat at {state.nutritionTargets.meta.fatPercentOfCalories}% of calories, and carbs from the remaining calories.
            </p>

            <p className="mt-3 text-[12px] leading-5 text-foreground/70">
              Fiber, iron, vitamin D, zinc, magnesium, B12, water, and creatine are shown as daily targets too. Some of these will stay at 0 intake until we expand food and supplement tracking coverage.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
