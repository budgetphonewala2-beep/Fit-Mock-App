"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Play, Plus } from "lucide-react";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { Card } from "@/components/ui/card";
import { cn, startOfTodayIso } from "@/lib/utils";
import { getSessionForDate } from "@/lib/recommendations";
import { FALLBACK_EXERCISE_VIDEO, findExerciseVideo } from "@/lib/exercise-video";

function parsePrescription(repsText: string) {
  const setMatch = repsText.match(/(\d+)\s*x\s*(.+)/i);

  if (setMatch) {
    return {
      totalSets: Number(setMatch[1]),
      repsLabel: setMatch[2],
      modeLabel: "reps",
    };
  }

  const roundMatch = repsText.match(/(\d+)\s*round/i);

  if (roundMatch) {
    return {
      totalSets: Number(roundMatch[1]),
      repsLabel: "45 sec",
      modeLabel: "interval",
    };
  }

  const minuteMatch = repsText.match(/(\d+)\s*min/i);

  if (minuteMatch) {
    return {
      totalSets: 1,
      repsLabel: `${minuteMatch[1]} min`,
      modeLabel: "time",
    };
  }

  return {
    totalSets: 1,
    repsLabel: repsText,
    modeLabel: "work",
  };
}

function getSuggestedLoad(equipmentLabel: string) {
  if (!equipmentLabel || equipmentLabel.toLowerCase() === "bodyweight") {
    return "Body";
  }

  return "5 kg";
}

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60)
    .toString()
    .padStart(1, "0");
  const seconds = (value % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function getOrdinal(n: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

function getExerciseVideoSource(exerciseId: string, exerciseName: string) {
  return findExerciseVideo(exerciseId, exerciseName) ?? FALLBACK_EXERCISE_VIDEO;
}

// useSearchParams() opts the subtree into client-side rendering, so it has to
// sit under a Suspense boundary or the page fails to prerender at build time.
function WorkoutExerciseContent() {
  const searchParams = useSearchParams();
  const { state, hydrated, logWorkoutLoad } = useDietFit();
  const [isPaused, setIsPaused] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [note, setNote] = useState("");
  const [completedSets, setCompletedSets] = useState(0);

  const sessionDate = searchParams.get("date") ?? startOfTodayIso();
  const workoutEnvironment = searchParams.get("environment") === "home" ? "home" : "gym";
  const sessionId = searchParams.get("sessionId") ?? "";
  const exerciseId = searchParams.get("exerciseId") ?? "";
  const exerciseName = searchParams.get("exerciseName") ?? "Workout movement";
  const repsText = searchParams.get("reps") ?? "3 x 10";
  const targetLabel = searchParams.get("target") ?? "Bodyweight";
  const equipmentLabel = searchParams.get("equipment") ?? targetLabel;
  const guidance =
    searchParams.get("guidance") ?? "Move with control and stay consistent from rep to rep.";
  const sessionTitle = searchParams.get("sessionTitle") ?? "Workout";

  useEffect(() => {
    if (isPaused) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isPaused]);

  if (!hydrated) {
    return <Card className="rounded-hero">Loading exercise...</Card>;
  }

  if (!state.onboardingCompleted || !state.workoutPlan || !state.profile) {
    return (
      <Card className="rounded-hero">
        Finish onboarding first so Fitmonk can load your workout.
      </Card>
    );
  }

  const session = getSessionForDate(state.workoutPlan, sessionDate);
  const sessionExercise =
    session?.exercises.find((exercise) => exercise.id === exerciseId) ?? null;
  const resolvedName = sessionExercise?.name ?? exerciseName;
  const resolvedReps = sessionExercise?.reps ?? repsText;
  const resolvedGuidance = sessionExercise?.guidance ?? guidance;
  const resolvedEquipment =
    sessionExercise?.equipment.length && sessionExercise.equipment.length > 0
      ? sessionExercise.equipment.join(", ")
      : equipmentLabel;
  const resolvedSessionTitle = session?.title ?? sessionTitle;
  const selectedLog = state.workoutLogs.find(
    (log) => log.sessionDate === sessionDate && log.sessionId === sessionId,
  );
  const isCompleted = selectedLog?.exercisesCompleted.includes(exerciseId) ?? false;
  const exerciseIndex =
    session?.exercises.findIndex((exercise) => exercise.id === exerciseId) ?? -1;
  const exercises = session?.exercises ?? [];
  const pagerCount = exercises.length > 0 ? exercises.length : 10;
  const { totalSets, repsLabel } = parsePrescription(resolvedReps);
  const suggestedLoad = getSuggestedLoad(resolvedEquipment);
  const parsedReps = parseInt(repsLabel, 10);
  const hasNumericReps = !Number.isNaN(parsedReps);
  const displaySets = totalSets;
  const currentSet = isCompleted ? displaySets : Math.min(completedSets + 1, displaySets);
  const allSetsComplete = completedSets >= displaySets;
  const timerRunning = !isPaused;
  const displayReps = hasNumericReps ? parsedReps : null;
  const loadMatch = suggestedLoad.match(/^(\d+(?:\.\d+)?)\s*(lb|kg)$/i);
  const hasNumericLoad = Boolean(loadMatch);
  const displayLoad = loadMatch ? parseFloat(loadMatch[1]) : 0;
  const loadUnit = loadMatch ? loadMatch[2] : "";
  const backHref = {
    pathname: "/workout",
    query: {
      date: sessionDate,
      environment: workoutEnvironment,
    },
  };
  const workoutVideoSource = getExerciseVideoSource(exerciseId, resolvedName);

  return (
    <div className="glass-ui h-screen overflow-hidden bg-background">
      <GlassBackdrop />
      <section className="relative mx-auto flex h-full w-full max-w-[460px] flex-col">
        {/* Header */}
        <div className="px-4 pb-2 pt-[calc(0.75rem+var(--safe-top))]">
          <div className="flex items-center justify-between">
            <Link
              href={backHref}
              className="glass flex h-10 items-center gap-1 rounded-full pl-2.5 pr-4 text-[14px] font-semibold text-primary-strong transition active:scale-[0.97]"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Link>
            {exerciseIndex >= 0 && exercises.length > 0 ? (
              <span className="glass rounded-full px-3 py-1.5 text-[12px] font-medium tabular-nums text-primary-strong">
                {exerciseIndex + 1} / {exercises.length}
              </span>
            ) : null}
          </div>
          <div className="mt-3">
            <p className="text-[12px] font-medium text-foreground/55">
              {resolvedSessionTitle}
            </p>
            <h1 className="mt-1 text-[26px] font-medium leading-tight tracking-[-0.02em] text-foreground">
              {resolvedName}
            </h1>
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 pt-1">
          <div className="relative overflow-hidden rounded-card bg-primary-strong shadow-[0_24px_48px_rgba(12,39,35,0.20)]">
            <video
              className="max-h-[56vh] w-full object-contain"
              controls
              playsInline
              preload="metadata"
              src={workoutVideoSource}
            >
              Your browser does not support the workout video.
            </video>
          </div>

          <button
            type="button"
            className="glass mx-auto mt-4 flex h-10 w-fit items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold text-primary-strong transition active:scale-[0.97]"
            onClick={() => setNote((current) => (current === "" ? resolvedGuidance : ""))}
          >
            <Plus className="h-4 w-4" />
            {note === "" ? "How to do it" : "Hide note"}
          </button>

          {note !== "" ? (
            <div className="glass mt-3 rounded-tile px-4 py-3 text-[13px] leading-5 text-foreground/70">
              {note}
            </div>
          ) : null}

          <div className="mt-4 flex justify-center gap-2">
            {Array.from({ length: pagerCount }, (_, index) => {
              const pagerExercise = exercises[index];

              if (!pagerExercise) {
                return (
                  <span
                    key={index}
                    className="h-2.5 w-2.5 rounded-full border border-foreground/14 bg-transparent"
                  />
                );
              }

              return (
                <Link
                  key={pagerExercise.id}
                  href={{
                    pathname: "/workout/exercise",
                    query: {
                      date: sessionDate,
                      sessionId,
                      sessionTitle: resolvedSessionTitle,
                      exerciseId: pagerExercise.id,
                      exerciseName: pagerExercise.name,
                      exerciseType: pagerExercise.type,
                      reps: pagerExercise.reps,
                      target:
                        pagerExercise.equipment.length > 0
                          ? pagerExercise.equipment.join(", ")
                          : "Bodyweight",
                      guidance: pagerExercise.guidance,
                      equipment:
                        pagerExercise.equipment.length > 0
                          ? pagerExercise.equipment.join(", ")
                          : "Bodyweight",
                    },
                  }}
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition",
                    exerciseIndex === index
                      ? "bg-primary-strong"
                      : "bg-foreground/14 hover:bg-foreground/25",
                  )}
                />
              );
            })}
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="grid grid-cols-[1fr_auto] gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            className={cn(
              "flex items-center justify-center gap-2 rounded-full py-4 text-[15px] font-semibold transition active:scale-[0.98]",
              allSetsComplete
                ? "bg-mint-medium/25 text-primary-strong/50"
                : timerRunning
                  ? "bg-mint-medium text-foreground shadow-[0_12px_26px_rgba(92,215,185,0.32)]"
                  : "bg-primary-strong text-white shadow-[0_12px_26px_rgba(12,39,35,0.2)]",
            )}
            disabled={allSetsComplete}
            onClick={() => {
              if (!timerRunning) {
                setIsPaused(false);
              } else {
                if (hasNumericLoad) {
                  logWorkoutLoad({
                    sessionDate,
                    sessionId,
                    exerciseId,
                    exerciseName: resolvedName,
                    setNumber: currentSet,
                    reps: displayReps,
                    loadValue: displayLoad,
                    loadUnit,
                  });
                }

                setIsPaused(true);
                setCompletedSets((prev) => Math.min(prev + 1, displaySets));
                setElapsedSeconds(0);
              }
            }}
          >
            {allSetsComplete ? (
              <>All sets done ✓</>
            ) : timerRunning ? (
              <>{`Log ${getOrdinal(currentSet)} set`}</>
            ) : completedSets === 0 ? (
              <><Play className="h-5 w-5" />Start</>
            ) : (
              <><Play className="h-5 w-5" />{`Start ${getOrdinal(currentSet)} set`}</>
            )}
          </button>
          <div className="glass flex min-w-[92px] items-center justify-center rounded-full px-5 text-[18px] font-medium tabular-nums text-primary-strong">
            {formatSeconds(elapsedSeconds)}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function WorkoutExercisePage() {
  return (
    <Suspense fallback={null}>
      <WorkoutExerciseContent />
    </Suspense>
  );
}
