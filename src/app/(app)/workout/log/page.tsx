"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  MoonStar,
  Plus,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, startOfTodayIso } from "@/lib/utils";
import {
  getDisplaySessionNote,
  getGoalSummary,
  getSessionForDate,
} from "@/lib/recommendations";

function getExerciseTypeLabel(type: string) {
  if (type === "warmup") {
    return "Warm up";
  }

  if (type === "conditioning") {
    return "Conditioning";
  }

  if (type === "mobility") {
    return "Mobility";
  }

  return "Strength";
}

function getExerciseIcon(type: string) {
  if (type === "warmup") {
    return Sparkles;
  }

  if (type === "conditioning") {
    return TimerReset;
  }

  if (type === "mobility") {
    return MoonStar;
  }

  return Dumbbell;
}

function getRestLabel(type: string) {
  if (type === "conditioning") {
    return "45 Sec";
  }

  if (type === "mobility") {
    return "Flow";
  }

  return "60 Sec";
}

function getRelativeLabel(offset: number) {
  if (offset === 0) {
    return "Today";
  }

  if (offset === 1) {
    return "Tomorrow";
  }

  if (offset === -1) {
    return "Yesterday";
  }

  return offset > 1 ? `${offset} days away` : `${Math.abs(offset)} days ago`;
}

export default function WorkoutLogPage() {
  const { state, hydrated, toggleExercise, completeWorkout } = useDietFit();
  const todayIso = startOfTodayIso();
  const [selectedDate, setSelectedDate] = useState(todayIso);

  useEffect(() => {
    setSelectedDate(todayIso);
  }, [todayIso]);

  useEffect(() => {
    const selectedDateButton = document.getElementById(`date-pill-${selectedDate}`);
    selectedDateButton?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedDate]);

  if (!hydrated) {
    return <Card className="rounded-hero">Loading workout log...</Card>;
  }

  if (!state.onboardingCompleted || !state.workoutPlan || !state.profile) {
    return (
      <Card className="rounded-hero">
        Finish onboarding first so Fitmonk can prepare your workout log.
      </Card>
    );
  }

  const selectedSession = getSessionForDate(state.workoutPlan, selectedDate);
  const selectedLog = state.workoutLogs.find(
    (log) => log.sessionDate === selectedDate && log.sessionId === selectedSession?.id,
  );
  const completedExercises = selectedLog?.exercisesCompleted.length ?? 0;
  const totalExercises = selectedSession?.exercises.length ?? 0;
  const progressPercent =
    totalExercises > 0 ? Math.round((completedExercises / totalExercises) * 100) : 0;
  const dateOptions = Array.from({ length: 14 }, (_, index) =>
    addDays(parseISO(todayIso), index - 3),
  );
  const dayOffset = differenceInCalendarDays(parseISO(selectedDate), parseISO(todayIso));
  const isFutureDate = dayOffset > 0;
  const goalSummary = getGoalSummary(state.profile);
  const sessionNote = getDisplaySessionNote(selectedSession?.note);

  return (
    <div className="grid gap-4 pb-32 pt-2">
      <Card className="overflow-hidden rounded-hero bg-[linear-gradient(145deg,_rgba(236,255,175,0.9),_rgba(255,255,255,0.88)_48%,_rgba(230,244,239,0.92)_100%)] p-0">
        <div className="px-4 pb-4 pt-4 sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/workout"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-3.5 py-2 text-[13px] font-semibold"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Workout home
            </Link>
            <div className="rounded-full bg-black px-3 py-1.5 text-[12px] font-semibold text-white">
              {progressPercent}% tracked
            </div>
          </div>

          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70">
                Log your workout
              </p>
              <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.04em] sm:text-[32px]">
                {selectedSession?.title ?? "Workout log"}
              </h1>
              <p className="mt-2 max-w-xl text-[13px] leading-5 text-muted">
                Track what you finished today and preview the coming week so the next session
                never feels random.
              </p>
            </div>

            <div className="hidden rounded-tile bg-white/82 px-3.5 py-3 shadow-[0_12px_24px_rgba(80,110,47,0.06)] sm:block">
              <div className="text-[12px] text-muted">{getRelativeLabel(dayOffset)}</div>
              <div className="mt-1 text-2xl font-semibold">
                {completedExercises} / {totalExercises}
              </div>
              <div className="mt-1 text-[12px] text-muted">{goalSummary.headline}</div>
            </div>
          </div>
        </div>

        <div className="border-t border-black/5 bg-white/58 px-4 py-3.5 backdrop-blur sm:px-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/72">
            <CalendarDays className="h-4 w-4" />
            Pick a day
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {dateOptions.map((date) => {
              const dateIso = format(date, "yyyy-MM-dd");
              const isSelected = dateIso === selectedDate;
              const dateSession = getSessionForDate(state.workoutPlan, dateIso);
              const dateLog = state.workoutLogs.find(
                (log) => log.sessionDate === dateIso && log.sessionId === dateSession?.id,
              );
              const isDone = Boolean(dateLog?.completedSession);
              const isToday = dateIso === todayIso;

              return (
                <button
                  key={dateIso}
                  id={`date-pill-${dateIso}`}
                  className={cn(
                    "min-w-[72px] shrink-0 rounded-tile border px-3 py-2.5 text-left transition",
                    isSelected
                      ? "border-brand bg-brand text-foreground shadow-[0_10px_20px_rgba(170,210,44,0.22)]"
                      : "border-black/6 bg-white/85 text-foreground hover:border-primary/18 hover:bg-white",
                  )}
                  onClick={() => setSelectedDate(dateIso)}
                  type="button"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-current/70">
                    {format(date, "EEE")}
                  </div>
                  <div className="mt-1 text-xl font-semibold leading-none">
                    {format(date, "d")}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-current/68">
                      {isToday ? "Today" : format(date, "MMM")}
                    </span>
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full border border-current/10",
                        isDone
                          ? "bg-current"
                          : dateSession?.isRestDay
                            ? "bg-current/20"
                            : "bg-transparent",
                      )}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden rounded-hero p-0">
        <div className="border-b border-black/6 bg-white/72 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/72">
                  {getRelativeLabel(dayOffset)}
                </span>
                <span className="rounded-full bg-black/5 px-3 py-1 text-[10px] font-semibold text-foreground/62">
                  {format(parseISO(selectedDate), "EEEE, MMM d")}
                </span>
                {isFutureDate ? (
                  <span className="rounded-full bg-brand/60 px-3 py-1 text-[10px] font-semibold text-foreground">
                    Future suggestion
                  </span>
                ) : null}
              </div>
              <h2 className="mt-2.5 text-[24px] font-semibold tracking-[-0.04em]">
                {selectedSession?.focus ?? "Session checklist"}
              </h2>
              <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-muted">
                {sessionNote ||
                  "Your daily workout is ready. Tap the plus button as you complete each move."}
              </p>
            </div>

            <div className="rounded-tile bg-[#f5fbe1] px-3.5 py-3 text-right shadow-[inset_0_0_0_1px_rgba(142,170,49,0.12)]">
              <div className="text-[12px] text-muted">
                {selectedSession?.durationMin ?? 0} min planned
              </div>
              <div className="mt-1 text-2xl font-semibold">{progressPercent}%</div>
            </div>
          </div>

          {totalExercises > 0 ? (
            <div className="mt-4 h-1.5 rounded-full bg-black/6">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,_var(--mint-medium),_var(--forest))] transition-[width]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          ) : null}
        </div>

        <div className="bg-white/66">
          {selectedSession?.isRestDay ? (
            <div className="px-4 py-6 sm:px-5">
              <div className="rounded-card bg-[linear-gradient(145deg,_rgba(248,252,227,0.92),_rgba(255,255,255,0.96))] p-5 shadow-[inset_0_0_0_1px_rgba(17,33,26,0.05)]">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-chip bg-primary/10 text-primary">
                    <MoonStar className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Recovery block</h3>
                    <p className="mt-2 text-[13px] leading-5 text-muted">
                      This day is reserved for mobility, hydration, sleep, and a light walk.
                      Keeping the rhythm matters more than squeezing in extra load.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="divide-y divide-black/6">
                {selectedSession?.exercises.map((exercise, index) => {
                  const checked =
                    selectedLog?.exercisesCompleted.includes(exercise.id) ?? false;
                  const Icon = getExerciseIcon(exercise.type);

                  return (
                    <div
                      key={exercise.id}
                      className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
                    >
                      <div
                        className={cn(
                          "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-chip border text-center",
                          checked
                            ? "border-[#BCF0E2] bg-[#E2F8F1] text-foreground"
                            : "border-black/6 bg-[#fbfcf6] text-primary",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em]">
                          {index + 1}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-[15px] font-semibold sm:text-base">
                              {exercise.name}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-muted">
                              {exercise.emphasis} · {exercise.reason}
                            </p>
                          </div>

                          <span className="shrink-0 rounded-[10px] bg-brand px-2.5 py-1 text-[10px] font-semibold text-foreground">
                            {getRestLabel(exercise.type)}
                          </span>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-[10px] bg-brand px-2.5 py-1 text-[12px] font-semibold text-foreground">
                            {exercise.reps}
                          </span>
                          <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-semibold text-foreground/62">
                            {getExerciseTypeLabel(exercise.type)}
                          </span>
                          <span className="rounded-full bg-primary/8 px-2.5 py-1 text-[10px] font-semibold text-primary/80">
                            {exercise.equipment.length > 0
                              ? exercise.equipment.join(", ")
                              : "Bodyweight"}
                          </span>
                        </div>
                      </div>

                      <button
                        aria-label={checked ? `Unmark ${exercise.name}` : `Mark ${exercise.name}`}
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition",
                          checked
                            ? "border-primary/15 bg-primary text-white"
                            : "border-black/10 bg-white text-foreground hover:border-primary/18 hover:text-primary",
                          isFutureDate &&
                            "cursor-not-allowed border-black/6 bg-black/4 text-foreground/35 hover:border-black/6 hover:text-foreground/35",
                        )}
                        disabled={isFutureDate}
                        onClick={() =>
                          selectedSession &&
                          toggleExercise(selectedSession.id, exercise.id, selectedDate)
                        }
                        type="button"
                      >
                        {checked ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-black/6 bg-[#f7ffd8] px-4 py-3.5 sm:px-5">
                {isFutureDate ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[13px] font-semibold text-foreground">
                        Planned workout preview
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-[#2C4842]">
                        Future dates stay read-only so this screen can show next week&apos;s
                        suggestions without mixing them into today&apos;s progress.
                      </p>
                    </div>
                    <div className="rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-foreground shadow-[0_8px_16px_rgba(88,118,34,0.08)]">
                      {format(parseISO(selectedDate), "EEE, MMM d")}
                    </div>
                  </div>
                ) : (
                  <Button
                    className="w-full justify-center gap-2 bg-black py-2.5 text-[14px] hover:bg-black/90"
                    onClick={() =>
                      selectedSession &&
                      completeWorkout(
                        selectedSession.id,
                        selectedSession.exercises.map((exercise) => exercise.id),
                        selectedDate,
                      )
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {progressPercent === 100 ? "Workout completed" : "Start workout"}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
