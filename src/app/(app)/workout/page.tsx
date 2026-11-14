"use client";

import { Suspense, useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Check,
  Droplets,
  Dumbbell,
  Flag,
  Flame,
  HeartPulse,
  History,
  HouseHeart,
  Lock,
  Mic,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Share2,
  Shuffle,
  Target,
  TimerReset,
  Trash2,
  Utensils,
  Video,
  Weight,
  X,
} from "lucide-react";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { Card } from "@/components/ui/card";
import { exerciseVideoById } from "@/lib/generated/exercise-video-map";
import {
  getMuscleCoverage,
  getMuscleCoverageScore,
  type MuscleCoverageEntry,
} from "@/lib/muscle-coverage";
import {
  getHomeSessionCompleteNote,
  isSessionRecorded,
  shouldAutoSaveHomeSession,
} from "@/lib/home-session-autosave";
import { FALLBACK_EXERCISE_VIDEO, findExerciseVideo } from "@/lib/exercise-video";
import { getGoalCycle } from "@/lib/goal-cycle";
import { nativeBridge } from "@/lib/native-bridge";
import { getSessionStepCounter } from "@/lib/session-step-counter";
import { ensureMicPermission, micBlockedMessage } from "@/lib/mic-permission";
import { VoiceErrorNote } from "@/components/ui/voice-error-note";
import { renderWorkoutShareCard } from "@/lib/share-cards";
import { workoutShareText } from "@/lib/share-text";
import { MuscleCoverageCard } from "@/components/workout/muscle-coverage-card";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { IconBadge } from "@/components/glass/icon-badge";
import { SessionOpenerFigure } from "@/components/workout/session-opener-figure";
import { clamp, cn, isProTier, startOfTodayIso } from "@/lib/utils";
import { useHardwareBackClose } from "@/lib/use-hardware-back";
import {
  getDisplaySessionNote,
  getNutritionForDate,
  getSessionForDate,
  getWorkoutWeekLabel,
} from "@/lib/recommendations";
import {
  adaptExerciseForReadiness,
  getAdaptedWorkoutSession,
  getReadinessForDate,
  getReadinessWorkoutAdjustment,
  MIN_HOME_EXERCISES,
  selectAdaptedExercises,
} from "@/lib/readiness";
import type {
  NutritionSummary,
  NutritionTargets,
  SavedCustomRoutine,
  WorkoutEnvironment,
  WorkoutPreferences,
  WorkoutSession,
} from "@/lib/types";
import type { WorkoutLibraryItem } from "@/lib/workout-library";

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

type ExerciseTileIcon = ComponentType<SVGProps<SVGSVGElement>>;
  type WorkoutPreset = {
    exerciseId: string;
    title: string;
    type: string;
    reps: string;
    target: string;
    equipment: string;
    guidance: string;
    sessionVideoSrc?: string;
  };
type GymSetDraft = {
  reps: number;
  load: number;
  completed: boolean;
  // false until the user (or a prior session log) supplies a real value.
  // Lets the row show "-" placeholders so the Kg/Reps pills read as
  // editable pickers instead of pre-filled numbers.
  touched?: boolean;
};
type GymMenuAnchor = {
  exerciseId: string;
  top: number;
  left: number;
};
type GymWeightPickerState = {
  exerciseId: string;
  setIndex: number;
  value: number;
  source?: "gym" | "home";

};
type GymRepsPickerState = {
  exerciseId: string;
  setIndex: number;
  value: number;
  source?: "gym" | "home";
};
type DailyQuestItem = {
  id: string;
  label: string;
  completed: boolean;
  icon: ExerciseTileIcon;
};
type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = { isFinal: boolean; 0: SpeechRecognitionAlternative };
type SpeechRecognitionEvent = { resultIndex: number; results: ArrayLike<SpeechRecognitionResult> };
type SpeechRecognitionErrorEvent = { error: string };
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;
type VoiceGymSetResult = {
  load: number | null;
  reps: number | null;
  setNumber: number | null;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const HOME_TOTAL_SECONDS = 60 * 60;
// Each home exercise is scheduled as a 5-minute slot; the timeline labels and
// the exercise count are both driven from this so the sum never overshoots
// the picked session length. Sticking to an integer minute value avoids the
// old bug where "4.5 min per exercise" displayed as 5 min and 5 exercises
// pushed a 30-minute session to 33 minutes.
const HOME_EXERCISE_SLOT_SECONDS = 5 * 60;

// Shape of a picked-length home session. Rest cards are inserted after the
// exercise indices in `restAfterExerciseIndices` (1-based) and each lasts
// `restSlotSeconds`. Short sessions skip the dedicated stretching block and
// rely on the warm-up alone. The finish is always the tail of homeTotalSeconds.
type HomeSessionShape = {
  totalSeconds: number;
  stretchingSeconds: number;
  warmupSeconds: number;
  exerciseCount: number;
  restSlotSeconds: number;
  restAfterExerciseIndices: number[];
};

function getHomeSessionShape(pickedMinutes: number | null | undefined): HomeSessionShape {
  if (pickedMinutes === 20) {
    // Short sessions still get the 3-move stretch, but at a minimum-viable
    // 20 sec per slot (each clip plays once). The 60 sec comes out of the
    // warm-up window, which drops from 4 min to 3 min (each of its 4 slots
    // still gets ~45 sec, comfortably longer than the 20-sec loop).
    return {
      totalSeconds: 20 * 60,
      stretchingSeconds: 60,
      warmupSeconds: 3 * 60,
      exerciseCount: 3,
      restSlotSeconds: 60,
      restAfterExerciseIndices: [2],
    };
  }
  if (pickedMinutes === 30) {
    // Same minimum stretch as 20-min. Warm-up drops from 8 min to 7 min,
    // leaving each of its 4 slots ~105 sec.
    return {
      totalSeconds: 30 * 60,
      stretchingSeconds: 60,
      warmupSeconds: 7 * 60,
      exerciseCount: 4,
      restSlotSeconds: 60,
      restAfterExerciseIndices: [2, 4],
    };
  }
  if (pickedMinutes === 45) {
    return {
      totalSeconds: 45 * 60,
      stretchingSeconds: 3 * 60,
      warmupSeconds: 6 * 60,
      exerciseCount: 6,
      restSlotSeconds: 2 * 60,
      restAfterExerciseIndices: [2, 4, 6],
    };
  }
  // 60 min (also the default when no length was picked). Rest between every
  // exercise so the pacing stays gentle for a long home session.
  return {
    totalSeconds: 60 * 60,
    stretchingSeconds: 10 * 60,
    warmupSeconds: 10 * 60,
    exerciseCount: 6,
    restSlotSeconds: 2 * 60,
    restAfterExerciseIndices: [1, 2, 3, 4, 5],
  };
}

// The four lengths getHomeSessionShape is tuned for. Non-picked (adaptive /
// default) sessions snap to the nearest bucket so the timeline rows always
// sum to the advertised session length.
const HOME_SESSION_MINUTE_BUCKETS = [20, 30, 45, 60] as const;
function snapHomeSessionMinutes(mins: number): number {
  return HOME_SESSION_MINUTE_BUCKETS.reduce<number>(
    (best, bucket) =>
      Math.abs(bucket - mins) < Math.abs(best - mins) ? bucket : best,
    60,
  );
}

const HOME_REST_SECONDS = 2 * 60;
// Rest stays restful until the last stretch, when it turns into a "get ready"
// beat for the movement coming up. Long enough to register the exercise, short
// enough that the bulk of the break is still recovery.
const HOME_REST_GET_READY_SECONDS = 15;
const HOME_TIMER_STORAGE_PREFIX = "dietfit-home-session-timer";
const GYM_CUSTOM_WORKOUTS_STORAGE_KEY = "dietfit-gym-custom-workouts";
const GYM_SAVED_ROUTINES_STORAGE_KEY = "dietfit-gym-saved-routines";
const GYM_DRAFT_ROUTINES_STORAGE_KEY = "dietfit-gym-draft-routines";
const GYM_SET_DRAFTS_STORAGE_KEY = "dietfit-gym-set-drafts";
const GYM_SET_COMPLETIONS_STORAGE_KEY = "dietfit-gym-set-completions";
const WORKOUT_FOCUS_SELECTIONS_STORAGE_KEY = "dietfit-workout-focus-selections";
const GYM_WEIGHT_ROW_HEIGHT = 40;
const GYM_WEIGHT_PICKER_SPACER = 60;
const GYM_WEIGHT_OPTIONS = Array.from(
  { length: Math.floor(300 / 2.5) + 1 },
  (_, index) => Number((index * 2.5).toFixed(1)),
);
const HOME_BASE_LOAD_VALUE = 1;
// 0 is a valid load — bodyweight sets (push-ups, planks, etc.) log at 0 kg
// and users doing add-on weight still get 0.5 kg increments above.
const HOME_LOAD_OPTIONS = Array.from(
  { length: Math.floor(100 / 0.5) + 1 },
  (_, index) => Number((index * 0.5).toFixed(1)),
);

const BODYWEIGHT_EQUIPMENT_RE = /^\s*bodyweight\b/i;

function isBodyweightExercise(equipment: string | undefined | null): boolean {
  return typeof equipment === "string" && BODYWEIGHT_EQUIPMENT_RE.test(equipment);
}

// Cards carry the equipment string as `equipmentLabel` (see allWorkoutCards),
// while the raw presets use `equipment`. Read whichever is present so this
// works from either shape.
function getHomeDefaultLoad(exercise: { equipmentLabel?: string; equipment?: string }): number {
  return isBodyweightExercise(exercise.equipmentLabel ?? exercise.equipment)
    ? 0
    : HOME_BASE_LOAD_VALUE;
}


type HomeExerciseReplacement = {
  exerciseId: string;
  title: string;
  targetLabel: string;
  valueLabel: string;
  guidance: string;
};

const HOME_EASIER_ALTERNATIVES: HomeExerciseReplacement[] = [
  { exerciseId: "alt-wall-push-up", title: "Wall Push-Up", targetLabel: "Chest · Easy", valueLabel: "3 × 15 reps", guidance: "Stand arm's length from a wall, palms flat, and push up at a gentle angle." },
  { exerciseId: "alt-knee-push-up", title: "Knee Push-Up", targetLabel: "Chest & arms", valueLabel: "3 × 12 reps", guidance: "Knees on the floor. Lower your chest to the ground and push back up with control." },
  { exerciseId: "alt-glute-bridge", title: "Glute Bridge", targetLabel: "Glutes & core", valueLabel: "3 × 15 reps", guidance: "Lie on your back, feet flat, press hips up and hold for 2 seconds." },
  { exerciseId: "alt-chair-squat", title: "Chair-Assisted Squat", targetLabel: "Legs · Easy", valueLabel: "3 × 12 reps", guidance: "Lower until your seat lightly touches a chair, then stand back up." },
  { exerciseId: "alt-standing-march", title: "Standing March", targetLabel: "Cardio · Low impact", valueLabel: "3 × 30 sec", guidance: "March in place lifting knees to hip height at a comfortable pace." },
  { exerciseId: "alt-dead-bug", title: "Dead Bug", targetLabel: "Core · Gentle", valueLabel: "3 × 10 reps", guidance: "Lie on your back, extend opposite arm and leg toward the floor, return slowly." },
  { exerciseId: "alt-band-row", title: "Resistance Band Row", targetLabel: "Back · Easy", valueLabel: "3 × 15 reps", guidance: "Anchor a band at chest height, step back, and row both hands to your sides." },
  { exerciseId: "alt-calf-raise", title: "Calf Raise", targetLabel: "Calves", valueLabel: "3 × 20 reps", guidance: "Hold a wall for balance and slowly rise onto your toes, then lower." },
  { exerciseId: "alt-incline-push-up", title: "Incline Push-Up", targetLabel: "Chest · Moderate", valueLabel: "3 × 12 reps", guidance: "Hands on a couch or bench for a gentler push-up angle." },
  { exerciseId: "alt-side-lying-clam", title: "Side-Lying Clamshell", targetLabel: "Hips & glutes", valueLabel: "3 × 15 reps", guidance: "Lie on your side with knees bent and open the top knee like a clamshell." },
];
const GYM_REPS_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1);

function formatTimerLabel(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseSetScheme(repsText: string) {
  const setMatch = repsText.match(/(\d+)\s*x\s*(\d+)/i);

  if (!setMatch) {
    return {
      sets: 3,
      reps: 12,
    };
  }

  return {
    sets: Math.max(1, Number(setMatch[1])),
    reps: Math.max(1, Number(setMatch[2])),
  };
}

function formatLoadValue(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function getBaseGymLoadValue() {
  return 0;
}

function normalizeHomeLoadValue(value: number) {
  return Math.max(0, Number((Math.round(value * 2) / 2).toFixed(1)));
}

function getGymSetDraftKey(sessionDate: string, exerciseId: string) {
  return `${sessionDate}:${exerciseId}`;
}

function getGymSetCompletionKey(
  sessionDate: string,
  exerciseId: string,
  setNumber: number,
) {
  return `${sessionDate}:${exerciseId}:${setNumber}`;
}

// Fills the session hero for the two lead-in steps (stretching, warm-up) --
// strength stays filmed, the openers are illustrated. SessionOpenerFigure
// renders one of five stick-figure archetypes matched to the move; here we
// wrap it in a deep-teal frame with a soft ambient glow and the move label
// overlaid so the hero holds the same rhythm as the video block.
function SessionOpenerPlaceholder({
  kind,
  moveTitle,
  exerciseId,
  running,
}: {
  kind: "stretching" | "warmup";
  moveTitle: string;
  exerciseId: string;
  running: boolean;
}) {
  const eyebrow = kind === "warmup" ? "Warm-up" : "Stretching";

  return (
    <div
      role="img"
      aria-label={`${eyebrow} illustration for ${moveTitle}`}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary-strong via-primary to-primary-strong text-white"
    >
      <div
        aria-hidden
        className={cn(
          "absolute h-[62%] w-[62%] rounded-full bg-white/8 blur-2xl",
          running && "animate-rest-breathe",
        )}
      />
      <div className="relative flex h-[76%] w-[76%] items-center justify-center">
        <SessionOpenerFigure exerciseId={exerciseId} running={running} />
      </div>
      <div className="absolute inset-x-4 bottom-4 rounded-chip border border-white/22 bg-black/38 px-3 py-2 text-left backdrop-blur-md">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/62">
          {eyebrow}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-[1.1] tracking-[-0.03em]">
          {moveTitle}
        </p>
      </div>
    </div>
  );
}

function StretchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="14" cy="5" r="2" />
      <path d="M8 9l4-2 3 2" />
      <path d="M12 9v4" />
      <path d="M12 13l-4 4" />
      <path d="M12 13l5 5" />
      <path d="M8 8l-3 3" />
    </svg>
  );
}

function PushupIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="18" cy="8" r="1.7" />
      <path d="M6 14h4l3-4h3" />
      <path d="M10 14l2 4" />
      <path d="M7 18h11" />
      <path d="M5 14h1" />
    </svg>
  );
}

function HomeToggleIcon({ className }: SVGProps<SVGSVGElement>) {
  return <HouseHeart aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", className)} />;
}

function InclineBenchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 18h14" />
      <path d="M9 15l4-5 4 2" />
      <path d="M8 9h8" />
      <path d="M6 7v4" />
      <path d="M18 7v4" />
      <path d="M9 15l-1 3" />
      <path d="M17 12l1 6" />
    </svg>
  );
}

function FlyesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="6" r="1.7" />
      <path d="M12 8v5" />
      <path d="M12 10l-6 3" />
      <path d="M12 10l6 3" />
      <path d="M6 13l-2 2" />
      <path d="M18 13l2 2" />
      <path d="M10 18l2-5 2 5" />
    </svg>
  );
}

function MachinePressIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 4v16" />
      <path d="M19 4v16" />
      <path d="M5 6h5" />
      <path d="M14 6h5" />
      <path d="M9 11h6" />
      <path d="M8 17h8" />
      <path d="M12 11v6" />
    </svg>
  );
}

function CurlIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="4" r="1.7" />
      <path d="M12 6v5" />
      <path d="M9 11l3 0" />
      <path d="M9 11v4" />
      <path d="M7 11h2" />
      <path d="M7 15h2" />
      <path d="M15 11l-3 0" />
      <path d="M15 11v-3" />
      <path d="M13 8h4" />
      <path d="M13 11h4" />
      <path d="M10 18l2-3 2 3" />
    </svg>
  );
}

function PullUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 4h16" />
      <circle cx="12" cy="8" r="1.7" />
      <path d="M8 4v3" />
      <path d="M16 4v3" />
      <path d="M8 7l4 3" />
      <path d="M16 7l-4 3" />
      <path d="M12 10v4" />
      <path d="M10 18l2-4 2 4" />
    </svg>
  );
}

function RowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="16" cy="6" r="1.7" />
      <path d="M14 8l-4 4" />
      <path d="M10 12l-4 2" />
      <path d="M10 12v4" />
      <path d="M6 14l-2 0" />
      <path d="M6 14v3" />
      <path d="M16 8l2 3" />
      <path d="M18 11l-1 3" />
      <path d="M6 19h12" />
    </svg>
  );
}

function DeadliftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="4" r="1.7" />
      <path d="M12 6v4" />
      <path d="M8 10h8" />
      <path d="M6 8v4" />
      <path d="M18 8v4" />
      <path d="M4 9h2" />
      <path d="M18 9h2" />
      <path d="M10 18l2-8 2 8" />
    </svg>
  );
}

function SquatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="4" r="1.7" />
      <path d="M12 6v3" />
      <path d="M7 9h10" />
      <path d="M5 7v4" />
      <path d="M19 7v4" />
      <path d="M12 9v3" />
      <path d="M12 12l-3 3" />
      <path d="M12 12l3 3" />
      <path d="M9 15v3" />
      <path d="M15 15v3" />
    </svg>
  );
}

function LegCurlIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 18h14" />
      <path d="M7 18v-4h10v4" />
      <circle cx="14" cy="10" r="1.5" />
      <path d="M8 14l2-4" />
      <path d="M10 10l4 0" />
      <path d="M16 14l-2-4" />
    </svg>
  );
}

function CoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="5" r="1.7" />
      <path d="M12 7v4" />
      <path d="M8 9h8" />
      <path d="M12 11v3" />
      <path d="M9 14h6" />
      <path d="M9 14l-1 4" />
      <path d="M15 14l1 4" />
    </svg>
  );
}

function ShoulderPressIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="1.7" />
      <path d="M12 10v4" />
      <path d="M8 4h2l2 6" />
      <path d="M16 4h-2l-2 6" />
      <path d="M6 3h2" />
      <path d="M16 3h2" />
      <path d="M10 18l2-4 2 4" />
    </svg>
  );
}

function BandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 6c1.8 0 3 1.2 3 3v6c0 1.8-1.2 3-3 3" />
      <path d="M17 6c-1.8 0-3 1.2-3 3v6c0 1.8 1.2 3 3 3" />
      <path d="M10 9h4" />
      <path d="M10 15h4" />
      <path d="M7 6H5" />
      <path d="M19 6h-2" />
      <path d="M7 18H5" />
      <path d="M19 18h-2" />
    </svg>
  );
}

function FloorPressIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 18h16" />
      <path d="M8 15l4-4 4 2" />
      <path d="M6 11h3" />
      <path d="M15 9h3" />
      <path d="M7 9v4" />
      <path d="M17 7v4" />
      <path d="M11 17l-1 1" />
      <path d="M15 17l1 1" />
    </svg>
  );
}

function DipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="5" r="1.6" />
      <path d="M8 9h8" />
      <path d="M8 9v5" />
      <path d="M16 9v5" />
      <path d="M12 7v5" />
      <path d="M12 12l-3 5" />
      <path d="M12 12l3 5" />
    </svg>
  );
}

function HammerCurlIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="4.5" r="1.6" />
      <path d="M12 6.5v4.5" />
      <path d="M9 11l3 1.5" />
      <path d="M15 8.5l2.5 2.5" />
      <path d="M17.5 11l-2 2" />
      <path d="M9 11l-2 2" />
      <path d="M7 13l2 2" />
      <path d="M10 18l2-5.5 2 5.5" />
    </svg>
  );
}

function ConcentrationCurlIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="15.5" cy="5" r="1.5" />
      <path d="M14 7l-2 4" />
      <path d="M12 11l-3 1" />
      <path d="M9 12l2 5" />
      <path d="M11 17l4-2" />
      <path d="M15 15l1-5" />
      <path d="M6 18h5" />
    </svg>
  );
}

function ReverseCurlIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="4.5" r="1.6" />
      <path d="M12 6.5v4.5" />
      <path d="M8 10h4" />
      <path d="M12 10h4" />
      <path d="M8 10v2.5" />
      <path d="M16 10v2.5" />
      <path d="M8 12.5h2.5" />
      <path d="M13.5 12.5H16" />
      <path d="M10 18l2-4.5 2 4.5" />
    </svg>
  );
}

function LungeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="13" cy="4.5" r="1.6" />
      <path d="M13 6.5l-2.5 4" />
      <path d="M10.5 10.5l-4 2" />
      <path d="M10.5 10.5l2.5 3" />
      <path d="M13 13.5l3.5 0" />
      <path d="M8 18h4" />
      <path d="M16 13.5l2 4.5" />
    </svg>
  );
}

function GluteBridgeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 16h5" />
      <path d="M9 16l3-5 3 5" />
      <path d="M15 16h5" />
      <path d="M8 16l-1.5 3" />
      <path d="M16 16l1.5 3" />
      <path d="M12 11v-2.5" />
    </svg>
  );
}

function getExerciseCardIcon(name: string, type: string): ExerciseTileIcon {
  if (/stretch|warm|dead\s?bug/i.test(name) || type === "warmup" || type === "mobility") {
    return StretchIcon;
  }

  if (/push[\s-]?up/i.test(name)) {
    return PushupIcon;
  }

  if (/floor\s+press/i.test(name)) {
    return FloorPressIcon;
  }

  if (/incline/i.test(name) && /press|bench/i.test(name)) {
    return InclineBenchIcon;
  }

  if (/resistance\s+band|band\s/i.test(name)) {
    return BandIcon;
  }

  if (/machine/i.test(name) && /press/i.test(name)) {
    return MachinePressIcon;
  }

  if (/dip/i.test(name)) {
    return DipIcon;
  }

  if (/fly|crossover/i.test(name)) {
    return FlyesIcon;
  }

  if (/concentration\s+curl/i.test(name)) {
    return ConcentrationCurlIcon;
  }

  if (/cross-body|hammer\s+curl/i.test(name)) {
    return HammerCurlIcon;
  }

  if (/reverse\s+curl/i.test(name)) {
    return ReverseCurlIcon;
  }

  if (/curl/i.test(name)) {
    return CurlIcon;
  }

  if (/pull[\s-]?up|pulldown|lat\s/i.test(name)) {
    return PullUpIcon;
  }

  if (/row/i.test(name)) {
    return RowIcon;
  }

  if (/deadlift/i.test(name)) {
    return DeadliftIcon;
  }

  if (/glute\s+bridge/i.test(name)) {
    return GluteBridgeIcon;
  }

  if (/lunge/i.test(name)) {
    return LungeIcon;
  }

  if (/squat|leg\s?press/i.test(name)) {
    return SquatIcon;
  }

  if (/leg\s?curl|calf/i.test(name)) {
    return LegCurlIcon;
  }

  if (/plank|crunch|ab\s|rollout|twist|woodchop|leg\s?raise/i.test(name)) {
    return CoreIcon;
  }

  if (/overhead|arnold|press|skull|extension|kickback|pushdown|raise|face\s?pull/i.test(name)) {
    return ShoulderPressIcon;
  }

  if (type === "conditioning") {
    return TimerReset;
  }

  return Dumbbell;
}


type MuscleFocus =
  | "back"
  | "biceps"
  | "chest"
  | "core"
  | "legs"
  | "shoulders"
  | "triceps";

const MUSCLE_FOCUS_VALUES: MuscleFocus[] = [
  "back",
  "biceps",
  "chest",
  "core",
  "legs",
  "shoulders",
  "triceps",
];

function isMuscleFocusKey(value: string): value is MuscleFocus {
  return MUSCLE_FOCUS_VALUES.includes(value as MuscleFocus);
}

type SessionOpenerMove = {
  exerciseId: string;
  title: string;
  target: string;
  guidance: string;
};

// Four warm-up moves per muscle focus, in a mobility → activation → pattern →
// dynamic progression. The session player splits the warm-up window into four
// equal sub-steps and walks through this list in order; ids follow the preset
// naming convention (`warmup-<focus>-<slot>-preset`) so the CSV → R2 → generated
// map pipeline picks each clip up automatically once a matching video is
// published. Until the map holds a URL for a given id, SessionOpenerFigure
// renders an illustrated stick-figure loop labelled with the move name and
// guidance.
const HOME_WARMUP_SEQUENCE_LENGTH = 4;
type HomeWarmupSequence = readonly [
  SessionOpenerMove,
  SessionOpenerMove,
  SessionOpenerMove,
  SessionOpenerMove,
];
const HOME_WARMUP_MOVES: Record<MuscleFocus, HomeWarmupSequence> = {
  back: [
    {
      exerciseId: "warmup-back-1-preset",
      title: "Band Pull-Aparts",
      target: "Rear delts, rhomboids",
      guidance: "Hold a light band at chest height and pull it apart, squeezing your shoulder blades.",
    },
    {
      exerciseId: "warmup-back-2-preset",
      title: "Bird Dog",
      target: "Core and back stability",
      guidance: "On all fours, reach one arm forward and the opposite leg back, hold a beat, then switch sides.",
    },
    {
      exerciseId: "warmup-back-3-preset",
      title: "Bodyweight Rows",
      target: "Lats, mid-back",
      guidance: "Hold a sturdy bar or table edge, lean back with a straight body and pull your chest toward it.",
    },
    {
      exerciseId: "warmup-back-4-preset",
      title: "Jumping Jacks",
      target: "Full-body pulse raiser",
      guidance: "Jump your feet wide as your arms sweep overhead, then back in. Keep a light, steady rhythm.",
    },
  ],
  biceps: [
    {
      exerciseId: "warmup-biceps-1-preset",
      title: "Wrist Rotations",
      target: "Wrist and forearm mobility",
      guidance: "Loose fists at your sides. Rotate the wrists slowly in wide circles both directions.",
    },
    {
      exerciseId: "warmup-biceps-2-preset",
      title: "Biceps Stretch",
      target: "Biceps, forearms",
      guidance: "Extend the arm, palm up, and gently pull the fingers back to lengthen through the biceps and forearm.",
    },
    {
      exerciseId: "warmup-biceps-3-preset",
      title: "Band Pull-Aparts",
      target: "Rear delts, rhomboids",
      guidance: "Hold a light band at chest height and pull it apart, squeezing your shoulder blades.",
    },
    {
      exerciseId: "warmup-biceps-4-preset",
      title: "Arm Circles",
      target: "Shoulder mobility",
      guidance: "Big circles forward for 30 seconds, then reverse for 30 seconds.",
    },
  ],
  chest: [
    {
      exerciseId: "warmup-chest-1-preset",
      title: "Cross-Body Arm Swings",
      target: "Chest, front delts, thoracic mobility",
      guidance: "Stand tall and swing your arms in wide arcs across your chest for a smooth 30 seconds, switching which arm crosses on top.",
    },
    {
      exerciseId: "warmup-chest-2-preset",
      title: "Arm Circles",
      target: "Shoulder mobility",
      guidance: "Extend your arms out to the sides and draw big circles forward, then reverse. Feel your shoulders warm up.",
    },
    {
      exerciseId: "warmup-chest-3-preset",
      title: "Scapular Push-Ups",
      target: "Scap activation",
      guidance: "In a plank, keep arms straight and pinch your shoulder blades together, then push them apart.",
    },
    {
      exerciseId: "warmup-chest-4-preset",
      title: "Wall Push-Ups",
      target: "Chest pattern grooving",
      guidance: "Stand arm's length from a wall and press through with control for 12 reps.",
    },
  ],
  core: [
    {
      exerciseId: "warmup-core-1-preset",
      title: "Bird Dog",
      target: "Core and back stability",
      guidance: "On all fours, reach one arm forward and the opposite leg back, hold a beat, then switch sides.",
    },
    {
      exerciseId: "warmup-core-2-preset",
      title: "Floor Reverse Crunches",
      target: "Lower abs",
      guidance: "Lie on your back and curl your knees toward your chest, lifting your hips slightly, then lower with control.",
    },
    {
      exerciseId: "warmup-core-3-preset",
      title: "Plank to Down-Dog Flow",
      target: "Shoulders, core, hamstrings",
      guidance: "From a high plank, push your hips up and back into down-dog, then flow forward to plank again.",
    },
    {
      exerciseId: "warmup-core-4-preset",
      title: "Jumping Jacks",
      target: "Full-body pulse raiser",
      guidance: "Jump your feet wide as your arms sweep overhead, then back in. Keep a light, steady rhythm.",
    },
  ],
  legs: [
    {
      exerciseId: "warmup-legs-1-preset",
      title: "Jumping Jacks",
      target: "Full-body pulse raiser",
      guidance: "Jump your feet wide as your arms sweep overhead, then back in. Keep a light, steady rhythm.",
    },
    {
      exerciseId: "warmup-legs-2-preset",
      title: "Bodyweight Squats",
      target: "Quads, glutes",
      guidance: "Feet shoulder-width, sit your hips back and down, then stand tall. Keep your chest up.",
    },
    {
      exerciseId: "warmup-legs-3-preset",
      title: "Side Lunges",
      target: "Inner thighs, glutes",
      guidance: "Step wide to one side and sit into that hip with the other leg straight, then push back and switch.",
    },
    {
      exerciseId: "warmup-legs-4-preset",
      title: "Walking Lunges",
      target: "Quads, glutes, balance",
      guidance: "Step forward into a lunge, lower your back knee gently, then bring the back foot through into the next step.",
    },
  ],
  shoulders: [
    {
      exerciseId: "warmup-shoulders-1-preset",
      title: "Shoulder Rolls",
      target: "Shoulder mobility",
      guidance: "Roll your shoulders up, back and down in slow circles, then reverse.",
    },
    {
      exerciseId: "warmup-shoulders-2-preset",
      title: "Arm Circles",
      target: "Shoulder mobility",
      guidance: "Arms out to the sides, draw small circles that grow bigger, then reverse direction.",
    },
    {
      exerciseId: "warmup-shoulders-3-preset",
      title: "Wall Slides",
      target: "Upper back activation",
      guidance: "Back to a wall, slide your arms up and down keeping elbows and wrists in contact.",
    },
    {
      exerciseId: "warmup-shoulders-4-preset",
      title: "Lateral Shoulder Swings",
      target: "Side delts",
      guidance: "Swing your arms out to the sides up to shoulder height and back down in a relaxed rhythm.",
    },
  ],
  triceps: [
    {
      exerciseId: "warmup-triceps-1-preset",
      title: "Arm Circles",
      target: "Shoulder mobility",
      guidance: "Arms out to the sides, draw small circles that grow bigger, then reverse direction.",
    },
    {
      exerciseId: "warmup-triceps-2-preset",
      title: "Dynamic Triceps Warm-Up",
      target: "Triceps, shoulders",
      guidance: "Reach both arms overhead, then bend your elbows to bring your hands behind your head, and reach up again.",
    },
    {
      exerciseId: "warmup-triceps-3-preset",
      title: "Plank to Down-Dog Flow",
      target: "Shoulders, core, hamstrings",
      guidance: "From a high plank, push your hips up and back into down-dog, then flow forward to plank again.",
    },
    {
      exerciseId: "warmup-triceps-4-preset",
      title: "Diamond Push-Ups",
      target: "Triceps",
      guidance: "Hands close together under your chest, lower slowly and press back up. Drop to your knees to keep it light.",
    },
  ],
};

// Stretching is a universal pre-workout prime, not a focus-specific stretch --
// the muscles you're about to train are what the warm-up wakes up. So the
// three stretch moves below run before every session regardless of the day's
// MuscleFocus; the player splits the stretching window into equal sub-steps
// (spine → hips → legs) matching HOME_WARMUP_MOVES' shape.
const HOME_STRETCH_SEQUENCE_LENGTH = 3;
type HomeStretchSequence = readonly [
  SessionOpenerMove,
  SessionOpenerMove,
  SessionOpenerMove,
];
const HOME_STRETCH_MOVES: HomeStretchSequence = [
  {
    exerciseId: "stretch-1-preset",
    title: "Plank to Down-Dog Flow",
    target: "Spine and shoulder mobility",
    guidance: "Start in a plank, press your hips up into a down-dog and reach your heels toward the floor, then flow back. Keep the breath long.",
  },
  {
    exerciseId: "stretch-2-preset",
    title: "Hip Circles",
    target: "Hip mobility",
    guidance: "Hands on hips, feet shoulder-width apart. Draw big circles with your hips, each direction for 30 seconds.",
  },
  {
    exerciseId: "stretch-3-preset",
    title: "Leg Swings",
    target: "Dynamic leg mobility",
    guidance: "Hold a wall for balance and swing each leg forward and back with a relaxed rhythm.",
  },
];

function isIsoDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function resolvePreferenceUpdate<T>(current: T, updater: T | ((current: T) => T)) {
  return typeof updater === "function" ? (updater as (current: T) => T)(current) : updater;
}

function parseVoiceGymSet(text: string): VoiceGymSetResult {
  const normalized = text
    .toLowerCase()
    .replace(/\bkilograms?\b/g, "kg")
    .replace(/\bkilos?\b/g, "kg")
    .replace(/\brepetitions?\b/g, "reps")
    .replace(/\breps?\b/g, "reps");
  const setMatch =
    normalized.match(/\bset\s*(\d{1,2})\b/) ??
    normalized.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+set\b/);
  const weightMatch =
    normalized.match(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|k g)\b/) ??
    normalized.match(/\bweight\s*(?:is|of|at)?\s*(\d+(?:\.\d+)?)/);
  const repsMatch =
    normalized.match(/(\d{1,3})\s*reps?\b/) ??
    normalized.match(/\breps?\s*(?:is|are|of)?\s*(\d{1,3})\b/) ??
    normalized.match(/\bfor\s+(\d{1,3})\b/);

  return {
    load: weightMatch ? Number(weightMatch[1]) : null,
    reps: repsMatch ? Number(repsMatch[1]) : null,
    setNumber: setMatch ? Number(setMatch[1]) : null,
  };
}


// Meal-quality rating for a given day, based on how many meals were logged and
// how much of the protein target was reached.
//   N/A     — no meals tracked
//   Poor    — only 1 meal
//   Average — 2 meals, or any case that doesn't reach Good/Great
//   Good    — 3+ meals and protein above half the recommended amount
//   Great   — 4+ meals and protein at least 90% of the recommended amount
function getMuscleFocusForDate(
  dateIso: string,
  session: WorkoutSession | null | undefined,
): MuscleFocus {
  const weekday = parseISO(dateIso).getDay();

  if (weekday === 1) {
    return "chest";
  }

  if (weekday === 2) {
    return "biceps";
  }

  if (weekday === 3) {
    return "back";
  }

  if (weekday === 4) {
    return "triceps";
  }

  if (weekday === 5) {
    return "shoulders";
  }

  if (weekday === 6) {
    return "legs";
  }

  const workoutText = [
    session?.focus,
    session?.title,
    ...(session?.exercises.map((exercise) => exercise.name) ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (/bicep|curl/.test(workoutText)) {
    return "biceps";
  }

  if (/tricep|extension|dip/.test(workoutText)) {
    return "triceps";
  }

  if (/chest|bench|press|fly/.test(workoutText)) {
    return "chest";
  }

  if (/back|row|lat|pull/.test(workoutText)) {
    return "back";
  }

  if (/shoulder|deltoid|overhead|lateral/.test(workoutText)) {
    return "shoulders";
  }

  if (/leg|squat|lunge|quad|glute|hinge/.test(workoutText)) {
    return "legs";
  }

  return "core";
}

function getMuscleFocusLabel(focus: MuscleFocus) {
  if (focus === "shoulders") {
    return "Shoulders";
  }

  return focus[0].toUpperCase() + focus.slice(1);
}

function migrateSavedGymRoutines(
  savedRoutines: Record<string, WorkoutPreset[]>,
): Partial<Record<MuscleFocus, WorkoutPreset[]>> {
  const migrated: Partial<Record<MuscleFocus, WorkoutPreset[]>> = {};
  const dateEntries = Object.entries(savedRoutines)
    .filter(([key]) => isIsoDateKey(key))
    .sort(([left], [right]) => left.localeCompare(right));
  const focusEntries = Object.entries(savedRoutines).filter(([key]) => isMuscleFocusKey(key));

  dateEntries.forEach(([dateKey, routine]) => {
    migrated[getMuscleFocusForDate(dateKey, null)] = routine;
  });

  focusEntries.forEach(([focusKey, routine]) => {
    migrated[focusKey as MuscleFocus] = routine;
  });

  return migrated;
}

// useSearchParams() opts the subtree into client-side rendering, so it has to
// sit under a Suspense boundary or the page fails to prerender at build time.
// Saves a home session once it's finished (clock run out, or every exercise
// logged). A component rather
// than a hook in the page, because what it needs is only known after the
// page's early returns.
function HomeSessionAutoSaver({
  shouldSave,
  onSave,
}: {
  shouldSave: boolean;
  onSave: () => void;
}) {
  useEffect(() => {
    if (shouldSave) {
      onSave();
    }
  }, [shouldSave, onSave]);
  return null;
}

function WorkoutPageContent() {
  const searchParams = useSearchParams();
  const {
    state,
    hydrated,
    toggleExercise,
    completeWorkout,
    logWorkoutLoad,
    removeWorkoutLoadLog,
    updateWorkoutPreferences,
    updateProfile,
  } = useDietFit();
  const router = useRouter();
  const todayIso = startOfTodayIso();
  const requestedDate = searchParams.get("date");
  const environmentParam = searchParams.get("environment");
  const requestedWorkoutEnvironment: WorkoutEnvironment =
    environmentParam === "home" ? "home" : "gym";
  const [selectedDate, setSelectedDate] = useState(requestedDate ?? todayIso);
  // Hoisted so the environment toggle, picker, and lock prompt below can tell
  // Starter tier from Pro. Home workouts are a Pro feature; a Starter who
  // onboarded as "home" is clamped to Gym until they upgrade.
  const isPro = isProTier(state.subscriptionTier);
  // Start on the user's own environment when the profile is already loaded
  // (coming back from another tab). Starting on "gym" and correcting it after
  // mount slid the toggle from Gym to Home on every return to this tab.
  const [selectedWorkoutEnvironment, setSelectedWorkoutEnvironment] =
    useState<WorkoutEnvironment>(() => {
      if (environmentParam === "home" || environmentParam === "gym") {
        return !isPro && environmentParam === "home" ? "gym" : environmentParam;
      }
      const profileEnvironment = hydrated ? state.profile?.workoutEnvironment : undefined;
      const resolved =
        profileEnvironment === "home" || profileEnvironment === "gym"
          ? profileEnvironment
          : requestedWorkoutEnvironment;
      return !isPro && resolved === "home" ? "gym" : resolved;
    });

  // An explicit ?environment= in the URL (e.g. a link from the Today tab) wins;
  // otherwise default the view to whichever environment the user chose at
  // onboarding, once their saved profile has loaded. For Starter tier, "home"
  // is always demoted to "gym" because Home workouts are Pro.
  useEffect(() => {
    if (environmentParam === "home" || environmentParam === "gym") {
      setSelectedWorkoutEnvironment(
        !isPro && environmentParam === "home" ? "gym" : environmentParam,
      );
      return;
    }

    if (!hydrated) {
      return;
    }

    const next = state.profile?.workoutEnvironment;
    if (next === "home" || next === "gym") {
      setSelectedWorkoutEnvironment(!isPro && next === "home" ? "gym" : next);
    }
  }, [hydrated, environmentParam, state.profile?.workoutEnvironment, isPro]);

  // Users can only train in the environment they picked at onboarding. The other
  // side of the toggle stays visible but locked until they change it in Profile.
  // Starter tier is locked to Gym regardless of profile, since Home workouts
  // are a Pro feature — the toggle below then opens the tier upsell prompt.
  const unlockedWorkoutEnvironment: WorkoutEnvironment | null = !isPro
    ? "gym"
    : state.profile?.workoutEnvironment === "home" || state.profile?.workoutEnvironment === "gym"
      ? state.profile.workoutEnvironment
      : null;
  const [homeTimerBaseSeconds, setHomeTimerBaseSeconds] = useState(0);
  const [homeTimerStartedAt, setHomeTimerStartedAt] = useState<number | null>(null);
  const [homeTimerNow, setHomeTimerNow] = useState(() => Date.now());
  const [homeTimerLoadedForDate, setHomeTimerLoadedForDate] = useState<string | null>(null);
  const [homeWarmupMarkedDone, setHomeWarmupMarkedDone] = useState(false);
  const [homeStretchMarkedDone, setHomeStretchMarkedDone] = useState(false);
  const [showHomeCompletePrompt, setShowHomeCompletePrompt] = useState(false);
  const [expandedHomeMilestones, setExpandedHomeMilestones] = useState<string[]>([]);
  const [lockedEnvironmentPrompt, setLockedEnvironmentPrompt] = useState<WorkoutEnvironment | null>(
    null,
  );
  const [showGymWorkoutPicker, setShowGymWorkoutPicker] = useState(false);
  const [customGymWorkoutName, setCustomGymWorkoutName] = useState("");
  const [customGymWorkoutReps, setCustomGymWorkoutReps] = useState("");
  const [expandedGymExerciseId, setExpandedGymExerciseId] = useState<string | null>(null);
  const [openGymMenuExerciseId, setOpenGymMenuExerciseId] = useState<string | null>(null);
  const [gymMenuAnchor, setGymMenuAnchor] = useState<GymMenuAnchor | null>(null);
  const [gymWeightPicker, setGymWeightPicker] = useState<GymWeightPickerState | null>(null);
  const [gymRepsPicker, setGymRepsPicker] = useState<GymRepsPickerState | null>(null);
  const [voiceGymSetExerciseId, setVoiceGymSetExerciseId] = useState<string | null>(null);
  const [voiceGymSetTranscript, setVoiceGymSetTranscript] = useState("");
  const [voiceGymSetError, setVoiceGymSetError] = useState<string | null>(null);
  const [homeSetLoggerOpen, setHomeSetLoggerOpen] = useState(false);
  const [homeSetLoggerSetIndex, setHomeSetLoggerSetIndex] = useState(0);
  // Which exercise the log sheet is editing. During a rest period the current
  // step points at the *next* exercise, so the sheet can't derive this itself.
  const [homeSetLoggerExerciseId, setHomeSetLoggerExerciseId] = useState<string | null>(null);
  const [homeTimelineSetIndexByExercise, setHomeTimelineSetIndexByExercise] = useState<
    Record<string, number>
  >({});
  const [gymSetDraftsByExercise, setGymSetDraftsByExercise] = useState<
    Record<string, GymSetDraft[]>
  >({});
  const [completedGymSetKeys, setCompletedGymSetKeys] = useState<Record<string, boolean>>({});

  const [showHomeSessionScreen, setShowHomeSessionScreen] = useState(false);
  // Android hardware back inside the WebView shell walks the URL history, and
  // the home session is a React overlay — without this, back would jump to
  // the previous tab (usually challenges) instead of just closing the player.
  useHardwareBackClose(showHomeSessionScreen, () => setShowHomeSessionScreen(false));
  const [replacedHomeExercises, setReplacedHomeExercises] = useState<Record<string, HomeExerciseReplacement>>({});
  const [showReplaceExerciseModal, setShowReplaceExerciseModal] = useState(false);
  const [showFocusDropdown, setShowFocusDropdown] = useState(false);
  const [showDailyWinsBreakdown, setShowDailyWinsBreakdown] = useState(false);
  const [sessionBarSentinel, setSessionBarSentinel] = useState<HTMLDivElement | null>(null);
  const [isSessionBarPinned, setIsSessionBarPinned] = useState(false);
  // Owned here (not in MuscleCoverageCard) so the drawer survives the stats
  // row being unmounted when the Home session bar pins on scroll.
  const [isCoverageExpanded, setIsCoverageExpanded] = useState(false);
  const [showFocusChangeWarning, setShowFocusChangeWarning] = useState(false);
  const [pendingFocusChange, setPendingFocusChange] = useState<MuscleFocus | null>(null);
  const [focusModeByDate, setFocusModeByDate] = useState<Record<string, "normal" | "rest" | "customize">>({});
  const [customizeRoutineNameByDate, setCustomizeRoutineNameByDate] = useState<Record<string, string>>({});
  const [showCustomizeNamePrompt, setShowCustomizeNamePrompt] = useState(false);
  // "create" = naming a new routine before building; "start" = rename + save on start.
  const [customizeNamePromptMode, setCustomizeNamePromptMode] = useState<"create" | "start">("create");
  const [customizeNameDraft, setCustomizeNameDraft] = useState("");
  // Id of the saved custom routine currently being edited (null = building a new one).
  const [editingCustomRoutineId, setEditingCustomRoutineId] = useState<string | null>(null);
  const [showCustomizeLibrary, setShowCustomizeLibrary] = useState(false);
  const [customizeLibraryItems, setCustomizeLibraryItems] = useState<WorkoutLibraryItem[]>([]);
  const [customizeLibraryLoading, setCustomizeLibraryLoading] = useState(false);
  const [customizeLibraryError, setCustomizeLibraryError] = useState<string | null>(null);
  const [customizeLibraryFetched, setCustomizeLibraryFetched] = useState(false);
  const [customizeLibrarySearch, setCustomizeLibrarySearch] = useState("");
  const [finisherMuscleLabel, setFinisherMuscleLabel] = useState<string | null>(null);
  const [homeSessionIntroPhase, setHomeSessionIntroPhase] =
    useState<"intro" | "leaving" | "session">("session");
  const [homeSessionIntroShown, setHomeSessionIntroShown] = useState(false);
  const homeSessionVideoRef = useRef<HTMLVideoElement | null>(null);
  const gymWeightPickerListRef = useRef<HTMLDivElement | null>(null);
  const lastGymWeightPickerTargetRef = useRef<string | null>(null);
  const gymRepsPickerListRef = useRef<HTMLDivElement | null>(null);
  const lastGymRepsPickerTargetRef = useRef<string | null>(null);
  const gymVoiceRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const gymVoiceTranscriptRef = useRef("");
  const workoutPreferences = state.workoutPreferences;
  const selectedMuscleFocusByDate =
    workoutPreferences.selectedMuscleFocusByDate as Record<string, MuscleFocus>;
  const savedGymRoutinesByFocus =
    workoutPreferences.savedGymRoutinesByFocus as Partial<Record<MuscleFocus, WorkoutPreset[]>>;
  const savedCustomRoutines = workoutPreferences.savedCustomRoutines ?? [];
  const selectedCustomRoutineByDate =
    workoutPreferences.selectedCustomRoutineByDate ?? {};
  const draftGymRoutinesByDate =
    workoutPreferences.draftGymRoutinesByDate as Record<string, WorkoutPreset[]>;
  const customGymWorkoutsByDate =
    workoutPreferences.customGymWorkoutsByDate as Record<string, WorkoutPreset[]>;
  const workoutPlan = state.workoutPlan;
  const baseSelectedSession = getSessionForDate(workoutPlan, selectedDate);
  const selectedDateReadiness = getReadinessForDate(state.readinessLogs, selectedDate);
  const readinessAdjustment = selectedDateReadiness
    ? getReadinessWorkoutAdjustment(selectedDateReadiness)
    : null;
  const selectedSession = getAdaptedWorkoutSession({
    environment: selectedWorkoutEnvironment,
    readinessLog: selectedDateReadiness,
    session: baseSelectedSession,
    subscriptionTier: state.subscriptionTier,
  });
  const hasReadinessForSelectedDate = Boolean(selectedDateReadiness);
  // Picking a length in the check-in stands in for answering it.
  const pickedHomeSessionMinutes =
    state.workoutPreferences?.homeSessionMinutesByDate?.[selectedDate] ?? null;
  // Length picker + adaptive shaping are a Pro-only lever, so ignore any
  // stored pick from a Starter and fall back to the classic 60-min session.
  const effectivePickedMinutes = isPro ? pickedHomeSessionMinutes : null;
  // Skip / Submit / pick-length all set this so the sheet only prompts once
  // per day, no matter how many times the user starts or resumes the session.
  const readinessDismissedForSelectedDate = Boolean(
    state.workoutPreferences?.dailyReadinessDismissedByDate?.[selectedDate],
  );
  const requiresReadinessBeforeStart =
    selectedDate === todayIso &&
    !hasReadinessForSelectedDate &&
    !effectivePickedMinutes &&
    !readinessDismissedForSelectedDate;
  // Anchor every home session -- picked, adaptive, or the classic default --
  // to a HomeSessionShape, so the timeline rows (stretch + warm-up + exercise
  // slots + rests) always add up to the advertised session length. Non-picked
  // sessions snap their requested length to the nearest supported bucket.
  const requestedHomeMinutes =
    effectivePickedMinutes ??
    (isPro && selectedSession?.isAdaptedForReadiness
      ? Math.max(20, selectedSession.durationMin)
      : HOME_TOTAL_SECONDS / 60);
  const homeSessionShape = getHomeSessionShape(
    snapHomeSessionMinutes(requestedHomeMinutes),
  );
  const homeTotalSeconds = homeSessionShape.totalSeconds;
  const homeStretchingSeconds = homeSessionShape.stretchingSeconds;
  const homeWarmupSeconds =
    homeSessionShape.stretchingSeconds + homeSessionShape.warmupSeconds;
  const setSelectedMuscleFocusByDate = (
    updater: Record<string, MuscleFocus> | ((current: Record<string, MuscleFocus>) => Record<string, MuscleFocus>),
  ) => {
    updateWorkoutPreferences((current) => ({
      ...current,
      selectedMuscleFocusByDate: resolvePreferenceUpdate(
        current.selectedMuscleFocusByDate as Record<string, MuscleFocus>,
        updater,
      ),
    }));
  };
  const setSavedGymRoutinesByFocus = (
    updater:
      | Partial<Record<MuscleFocus, WorkoutPreset[]>>
      | ((current: Partial<Record<MuscleFocus, WorkoutPreset[]>>) => Partial<Record<MuscleFocus, WorkoutPreset[]>>),
  ) => {
    updateWorkoutPreferences((current) => ({
      ...current,
      savedGymRoutinesByFocus: resolvePreferenceUpdate(
        current.savedGymRoutinesByFocus as Partial<Record<MuscleFocus, WorkoutPreset[]>>,
        updater,
      ) as WorkoutPreferences["savedGymRoutinesByFocus"],
    }));
  };
  const setSavedCustomRoutines = (
    updater:
      | SavedCustomRoutine[]
      | ((current: SavedCustomRoutine[]) => SavedCustomRoutine[]),
  ) => {
    updateWorkoutPreferences((current) => ({
      ...current,
      savedCustomRoutines: resolvePreferenceUpdate(
        current.savedCustomRoutines ?? [],
        updater,
      ),
    }));
  };
  const setSelectedCustomRoutineByDate = (
    updater:
      | Record<string, string>
      | ((current: Record<string, string>) => Record<string, string>),
  ) => {
    updateWorkoutPreferences((current) => ({
      ...current,
      selectedCustomRoutineByDate: resolvePreferenceUpdate(
        current.selectedCustomRoutineByDate ?? {},
        updater,
      ),
    }));
  };
  const setDraftGymRoutinesByDate = (
    updater:
      | Record<string, WorkoutPreset[]>
      | ((current: Record<string, WorkoutPreset[]>) => Record<string, WorkoutPreset[]>),
  ) => {
    updateWorkoutPreferences((current) => ({
      ...current,
      draftGymRoutinesByDate: resolvePreferenceUpdate(
        current.draftGymRoutinesByDate as Record<string, WorkoutPreset[]>,
        updater,
      ),
    }));
  };
  const setCustomGymWorkoutsByDate = (
    updater:
      | Record<string, WorkoutPreset[]>
      | ((current: Record<string, WorkoutPreset[]>) => Record<string, WorkoutPreset[]>),
  ) => {
    updateWorkoutPreferences((current) => ({
      ...current,
      customGymWorkoutsByDate: resolvePreferenceUpdate(
        current.customGymWorkoutsByDate as Record<string, WorkoutPreset[]>,
        updater,
      ),
    }));
  };

  useEffect(() => {
    setSelectedDate(requestedDate ?? todayIso);
  }, [requestedDate, todayIso]);

  useEffect(() => {
    const selectedDateButton = document.getElementById(`workout-date-${selectedDate}`);
    selectedDateButton?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    // Also on a Gym/Home switch: each mode mounts its own strip.
  }, [selectedDate, selectedWorkoutEnvironment]);

  useEffect(() => {
    setShowHomeCompletePrompt(false);
    setShowGymWorkoutPicker(false);
    setShowCustomizeNamePrompt(false);
    setShowCustomizeLibrary(false);
    setCustomizeLibrarySearch("");
    setCustomGymWorkoutName("");
    setCustomGymWorkoutReps("");
    setExpandedGymExerciseId(null);
    setOpenGymMenuExerciseId(null);
    setGymMenuAnchor(null);
    setGymWeightPicker(null);
    setGymRepsPicker(null);
    setExpandedHomeMilestones([]);
    setShowHomeSessionScreen(false);
    setHomeSessionIntroPhase("session");
    setHomeSessionIntroShown(false);
    setHomeSetLoggerOpen(false);
    setHomeSetLoggerSetIndex(0);
    setHomeTimelineSetIndexByExercise({});
  }, [selectedDate, selectedWorkoutEnvironment]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedGymSetDrafts = window.localStorage.getItem(GYM_SET_DRAFTS_STORAGE_KEY);

    if (!storedGymSetDrafts) {
      setGymSetDraftsByExercise({});
      return;
    }

    try {
      const parsed = JSON.parse(storedGymSetDrafts) as Record<string, GymSetDraft[]>;
      setGymSetDraftsByExercise(parsed);
    } catch {
      setGymSetDraftsByExercise({});
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      GYM_SET_DRAFTS_STORAGE_KEY,
      JSON.stringify(gymSetDraftsByExercise),
    );
  }, [gymSetDraftsByExercise]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedGymSetCompletions = window.localStorage.getItem(
      GYM_SET_COMPLETIONS_STORAGE_KEY,
    );

    if (!storedGymSetCompletions) {
      setCompletedGymSetKeys({});
      return;
    }

    try {
      const parsed = JSON.parse(storedGymSetCompletions) as Record<string, boolean>;
      setCompletedGymSetKeys(parsed);
    } catch {
      setCompletedGymSetKeys({});
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      GYM_SET_COMPLETIONS_STORAGE_KEY,
      JSON.stringify(completedGymSetKeys),
    );
  }, [completedGymSetKeys]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedFocusSelections = window.localStorage.getItem(
      WORKOUT_FOCUS_SELECTIONS_STORAGE_KEY,
    );

    if (!storedFocusSelections) {
      return;
    }

    try {
      const parsed = JSON.parse(storedFocusSelections) as Record<string, string>;
      const normalized = Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, MuscleFocus] =>
            isIsoDateKey(entry[0]) && isMuscleFocusKey(entry[1]),
        ),
      );
      setSelectedMuscleFocusByDate(normalized);
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      WORKOUT_FOCUS_SELECTIONS_STORAGE_KEY,
      JSON.stringify(selectedMuscleFocusByDate),
    );
  }, [selectedMuscleFocusByDate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedCustomGymWorkouts = window.localStorage.getItem(
      GYM_CUSTOM_WORKOUTS_STORAGE_KEY,
    );

    if (!storedCustomGymWorkouts) {
      return;
    }

    try {
      const parsed = JSON.parse(storedCustomGymWorkouts) as Record<string, WorkoutPreset[]>;
      setCustomGymWorkoutsByDate(parsed);
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      GYM_CUSTOM_WORKOUTS_STORAGE_KEY,
      JSON.stringify(customGymWorkoutsByDate),
    );
  }, [customGymWorkoutsByDate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedDraftGymRoutines = window.localStorage.getItem(
      GYM_DRAFT_ROUTINES_STORAGE_KEY,
    );

    if (!storedDraftGymRoutines) {
      return;
    }

    try {
      const parsed = JSON.parse(storedDraftGymRoutines) as Record<string, WorkoutPreset[]>;
      setDraftGymRoutinesByDate(parsed);
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      GYM_DRAFT_ROUTINES_STORAGE_KEY,
      JSON.stringify(draftGymRoutinesByDate),
    );
  }, [draftGymRoutinesByDate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedSavedGymRoutines = window.localStorage.getItem(
      GYM_SAVED_ROUTINES_STORAGE_KEY,
    );

    if (!storedSavedGymRoutines) {
      return;
    }

    try {
      const parsed = JSON.parse(storedSavedGymRoutines) as Record<string, WorkoutPreset[]>;
      setSavedGymRoutinesByFocus(migrateSavedGymRoutines(parsed));
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      GYM_SAVED_ROUTINES_STORAGE_KEY,
      JSON.stringify(savedGymRoutinesByFocus),
    );
  }, [savedGymRoutinesByFocus]);

  useEffect(() => {
    return () => {
      gymVoiceRecognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!openGymMenuExerciseId) {
      return;
    }

    const dismissMenu = () => {
      setOpenGymMenuExerciseId(null);
      setGymMenuAnchor(null);
    };

    window.addEventListener("scroll", dismissMenu, { capture: true, passive: true });
    window.addEventListener("resize", dismissMenu);

    return () => {
      window.removeEventListener("scroll", dismissMenu, { capture: true });
      window.removeEventListener("resize", dismissMenu);
    };
  }, [openGymMenuExerciseId]);

  useEffect(() => {
    if (!gymWeightPicker || !gymWeightPickerListRef.current) {
      lastGymWeightPickerTargetRef.current = null;
      return;
    }

    const targetKey = `${gymWeightPicker.source ?? "gym"}:${gymWeightPicker.exerciseId}:${gymWeightPicker.setIndex}`;

    if (lastGymWeightPickerTargetRef.current === targetKey) {
      return;
    }

    lastGymWeightPickerTargetRef.current = targetKey;

    const weightOptions =
      gymWeightPicker.source === "home"
        ? HOME_LOAD_OPTIONS
        : GYM_WEIGHT_OPTIONS;
    const selectedIndex = weightOptions.findIndex(
      (option) => option === gymWeightPicker.value,
    );

    if (selectedIndex < 0) {
      return;
    }

    gymWeightPickerListRef.current.scrollTo({
      top: selectedIndex * GYM_WEIGHT_ROW_HEIGHT,
      behavior: "auto",
    });
  }, [gymWeightPicker]);

  useEffect(() => {
    if (!gymRepsPicker || !gymRepsPickerListRef.current) {
      lastGymRepsPickerTargetRef.current = null;
      return;
    }

    const targetKey = `${gymRepsPicker.source ?? "gym"}:${gymRepsPicker.exerciseId}:${gymRepsPicker.setIndex}`;

    if (lastGymRepsPickerTargetRef.current === targetKey) {
      return;
    }

    lastGymRepsPickerTargetRef.current = targetKey;

    const selectedIndex = GYM_REPS_OPTIONS.findIndex(
      (option) => option === gymRepsPicker.value,
    );

    if (selectedIndex < 0) {
      return;
    }

    gymRepsPickerListRef.current.scrollTo({
      top: selectedIndex * GYM_WEIGHT_ROW_HEIGHT,
      behavior: "auto",
    });
  }, [gymRepsPicker]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedTimer = window.localStorage.getItem(
      `${HOME_TIMER_STORAGE_PREFIX}:${selectedDate}`,
    );

    if (!storedTimer) {
      setHomeTimerBaseSeconds(0);
      setHomeTimerStartedAt(null);
      setHomeTimerNow(Date.now());
      setHomeWarmupMarkedDone(false);
      setHomeStretchMarkedDone(false);
      setHomeTimerLoadedForDate(selectedDate);
      return;
    }

    try {
      const parsed = JSON.parse(storedTimer) as {
        baseSeconds?: number;
        startedAt?: number | null;
        warmupMarkedDone?: boolean;
        stretchMarkedDone?: boolean;
      };
      // Not clamped to the session length here: homeElapsedSeconds already
      // caps it, and reading homeTotalSeconds would tie this effect to it.
      setHomeTimerBaseSeconds(Math.max(0, parsed.baseSeconds ?? 0));
      setHomeTimerStartedAt(parsed.startedAt ?? null);
      setHomeTimerNow(Date.now());
      setHomeWarmupMarkedDone(parsed.warmupMarkedDone ?? false);
      setHomeStretchMarkedDone(parsed.stretchMarkedDone ?? false);
      setHomeTimerLoadedForDate(selectedDate);
    } catch {
      setHomeTimerBaseSeconds(0);
      setHomeTimerStartedAt(null);
      setHomeTimerNow(Date.now());
      setHomeWarmupMarkedDone(false);
      setHomeStretchMarkedDone(false);
      setHomeTimerLoadedForDate(selectedDate);
    }
    // Only when the day changes. It used to re-run whenever the session length
    // changed, and picking a length in the check-in changes it in the same
    // moment Play starts the timer: this effect then ran before the save and
    // put the stored paused timer back, so the player opened paused.
  }, [selectedDate]);

  useEffect(() => {
    if (typeof window === "undefined" || homeTimerLoadedForDate !== selectedDate) {
      return;
    }

    window.localStorage.setItem(
      `${HOME_TIMER_STORAGE_PREFIX}:${selectedDate}`,
      JSON.stringify({
        baseSeconds: homeTimerBaseSeconds,
        startedAt: homeTimerStartedAt,
        warmupMarkedDone: homeWarmupMarkedDone,
        stretchMarkedDone: homeStretchMarkedDone,
      }),
    );
  }, [
    homeTimerBaseSeconds,
    homeTimerLoadedForDate,
    homeTimerStartedAt,
    homeStretchMarkedDone,
    homeWarmupMarkedDone,
    selectedDate,
  ]);

  useEffect(() => {
    if (homeTimerStartedAt === null) {
      return;
    }

    setHomeTimerNow(Date.now());
    const interval = window.setInterval(() => {
      const now = Date.now();
      const liveElapsed =
        homeTimerBaseSeconds +
        Math.max(0, Math.floor((now - homeTimerStartedAt) / 1000));

      if (liveElapsed >= homeTotalSeconds) {
        setHomeTimerBaseSeconds(homeTotalSeconds);
        setHomeTimerStartedAt(null);
      }

      setHomeTimerNow(now);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [homeTimerBaseSeconds, homeTimerStartedAt, homeTotalSeconds]);

  useEffect(() => {
    const video = homeSessionVideoRef.current;

    if (!video || !showHomeSessionScreen) {
      return;
    }

    if (homeTimerStartedAt === null) {
      video.pause();
      return;
    }

    void video.play().catch(() => undefined);
  }, [homeTimerStartedAt, showHomeSessionScreen]);

  useEffect(() => {
    if (!showHomeSessionScreen) {
      return;
    }

    if (homeSessionIntroShown) {
      setHomeSessionIntroPhase("session");
      return;
    }

    setHomeSessionIntroPhase("intro");

    const fadeTimer = window.setTimeout(() => {
      setHomeSessionIntroPhase("leaving");
    }, 3000);
    const finishTimer = window.setTimeout(() => {
      setHomeSessionIntroPhase("session");
      setHomeSessionIntroShown(true);
    }, 3500);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(finishTimer);
    };
  }, [homeSessionIntroShown, showHomeSessionScreen]);

  // Home sessions only run today and Home mode has no date picker, so
  // switching to it always lands on today.
  useEffect(() => {
    if (selectedWorkoutEnvironment === "home") {
      setSelectedDate(todayIso);
    }
  }, [selectedWorkoutEnvironment, todayIso]);

  // The Home session bar pins to the top on scroll. A sentinel just above it
  // tells us when it's pinned, so the stats row can fold away and the pinned
  // bar stays one line tall.
  useEffect(() => {
    if (!sessionBarSentinel) {
      setIsSessionBarPinned(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsSessionBarPinned(!entry.isIntersecting),
      { rootMargin: "-16px 0px 0px 0px" },
    );
    observer.observe(sessionBarSentinel);
    return () => observer.disconnect();
  }, [sessionBarSentinel]);

  if (!hydrated) {
    return <Card className="rounded-hero">Loading workout plan...</Card>;
  }

  if (!state.onboardingCompleted || !state.workoutPlan || !state.profile) {
    return (
      <Card className="rounded-hero">
        Finish onboarding first so Fitmonk can match your routine, environment, and focus areas.
      </Card>
    );
  }

  const sliderStartIso = state.profile.appStartedAt ?? todayIso;
  const sliderStartDate = parseISO(sliderStartIso);
  const sliderDays = Math.max(
    differenceInCalendarDays(addDays(parseISO(todayIso), 10), sliderStartDate) + 1,
    14,
  );
  const dateOptions = Array.from({ length: sliderDays }, (_, index) =>
    addDays(sliderStartDate, index),
  );
  const workoutWeekLabel = getWorkoutWeekLabel(state.profile.appStartedAt, selectedDate);
  const sessionNote = getDisplaySessionNote(selectedSession?.note);
  const todayNutrition = getNutritionForDate(state.mealLogs, todayIso);
  const todayWaterMl = state.waterLogs.find((log) => log.date === todayIso)?.amountMl ?? 0;
  const selectedDateOffset = differenceInCalendarDays(
    parseISO(selectedDate),
    parseISO(todayIso),
  );
  const isPastSelectedDate = selectedDateOffset < 0;
  const isFutureSelectedDate = selectedDateOffset > 0;
  const isSelectedToday = selectedDateOffset === 0;
  const defaultMuscleFocus = getMuscleFocusForDate(selectedDate, selectedSession);
  const muscleFocus = selectedMuscleFocusByDate[selectedDate] ?? defaultMuscleFocus;
  const muscleFocusLabel = getMuscleFocusLabel(muscleFocus);
  const focusMode = focusModeByDate[selectedDate] ?? "normal";
  const customizeRoutineName = customizeRoutineNameByDate[selectedDate] ?? "";
  const homeElapsedSeconds = Math.min(
    homeTotalSeconds,
    homeTimerBaseSeconds +
      (homeTimerStartedAt === null
        ? 0
        : Math.max(0, Math.floor((homeTimerNow - homeTimerStartedAt) / 1000))),
  );
  const isHomeTimerRunning = homeTimerStartedAt !== null;
  const isHomeSessionComplete = homeElapsedSeconds >= homeTotalSeconds;

  const shellStyles = [
    { shellClass: "bg-[linear-gradient(180deg,_rgba(188,240,226,0.82),_rgba(140,228,207,0.58))]", barClass: "bg-[#8AE4CF]" },
    { shellClass: "bg-[linear-gradient(180deg,_rgba(253,217,190,0.84),_rgba(250,187,140,0.56))]", barClass: "bg-sun" },
    { shellClass: "bg-[linear-gradient(180deg,_rgba(203,227,219,0.9),_rgba(171,206,196,0.64))]", barClass: "bg-[#B0CFC5]" },
    { shellClass: "bg-[linear-gradient(180deg,_rgba(188,240,226,0.82),_rgba(140,228,207,0.58))]", barClass: "bg-[#8AE4CF]" },
    { shellClass: "bg-[linear-gradient(180deg,_rgba(253,217,190,0.84),_rgba(250,187,140,0.56))]", barClass: "bg-sun" },
    { shellClass: "bg-[linear-gradient(180deg,_rgba(203,227,219,0.9),_rgba(171,206,196,0.64))]", barClass: "bg-[#B0CFC5]" },
  ];

  const gymWorkoutsByFocus: Record<MuscleFocus, WorkoutPreset[]> = {
    chest: [
      { exerciseId: "barbell-bench-press-preset", title: "Barbell Bench Press", type: "strength", reps: "4 x 8", target: "Chest", equipment: "Barbell, bench", guidance: "Drive feet into the floor, lower under control, and press in a straight path." },
      { exerciseId: "incline-dumbbell-press-preset", title: "Incline Dumbbell Press", type: "strength", reps: "3 x 10", target: "Upper chest", equipment: "Bench, dumbbells", guidance: "Keep the elbows slightly tucked and pause lightly at the bottom." },
      { exerciseId: "dumbbell-flyes-preset", title: "Dumbbell Flyes", type: "strength", reps: "3 x 12", target: "Stretch", equipment: "Bench, dumbbells", guidance: "Move in a wide arc, keep a soft elbow bend, and squeeze through the chest.", sessionVideoSrc: exerciseVideoById["dumbbell-flyes-preset"] },
      { exerciseId: "machine-chest-press-preset", title: "Machine Chest Press", type: "strength", reps: "3 x 10", target: "Machine", equipment: "Chest press machine", guidance: "Sit tall, keep shoulders down, and finish each rep without locking out harshly." },
      { exerciseId: "cable-crossover-preset", title: "Cable Crossover", type: "strength", reps: "3 x 12", target: "Inner chest", equipment: "Cable machine", guidance: "Keep a slight forward lean, squeeze hard at the center, and control the return." },
      { exerciseId: "chest-dips-preset", title: "Chest Dips", type: "strength", reps: "3 x 10", target: "Lower chest", equipment: "Dip station", guidance: "Lean slightly forward, lower until a gentle stretch, and press back up smoothly." },
    ],
    biceps: [
      { exerciseId: "dumbbell-bicep-curl-preset", title: "Dumbbell Bicep Curl", type: "strength", reps: "4 x 10", target: "Biceps", equipment: "Dumbbells", guidance: "Keep elbows pinned to your sides and curl without swinging your torso." },
      { exerciseId: "hammer-curl-preset", title: "Hammer Curl", type: "strength", reps: "3 x 12", target: "Brachialis", equipment: "Dumbbells", guidance: "Keep a neutral grip and squeeze at the top for a full contraction." },
      { exerciseId: "concentration-curl-preset", title: "Concentration Curl", type: "strength", reps: "3 x 12", target: "Peak", equipment: "Dumbbell", guidance: "Brace your elbow against your inner thigh and curl with strict form." },
      { exerciseId: "resistance-band-curl-preset", title: "Resistance Band Curl", type: "strength", reps: "3 x 15", target: "Biceps", equipment: "Resistance band", guidance: "Stand evenly on the band and keep smooth tension through the full curl." },
      { exerciseId: "reverse-curl-preset", title: "Reverse Curl", type: "strength", reps: "3 x 12", target: "Forearm", equipment: "Dumbbells or band", guidance: "Use an overhand grip, keep wrists steady, and control the lowering phase." },
    ],
    back: [
      { exerciseId: "deadlift-preset", title: "Barbell Deadlift", type: "strength", reps: "4 x 6", target: "Full back", equipment: "Barbell", guidance: "Hinge at the hips, keep your back flat, and drive through your heels." },
      { exerciseId: "pull-up-preset", title: "Pull-Ups", type: "strength", reps: "3 x 8", target: "Lats", equipment: "Pull-up bar", guidance: "Initiate with your lats, pull until chin clears the bar, and lower with control." },
      { exerciseId: "bent-over-row-preset", title: "Bent-Over Barbell Row", type: "strength", reps: "4 x 8", target: "Mid back", equipment: "Barbell", guidance: "Bend at 45°, pull the bar to your lower chest, and squeeze your shoulder blades." },
      { exerciseId: "seated-cable-row-preset", title: "Seated Cable Row", type: "strength", reps: "3 x 10", target: "Mid back", equipment: "Cable machine", guidance: "Sit tall, pull to your navel, and let the weight stretch your lats on the return." },
      { exerciseId: "lat-pulldown-preset", title: "Lat Pulldown", type: "strength", reps: "3 x 10", target: "Lats", equipment: "Cable machine", guidance: "Lean slightly back, pull to your upper chest, and control the eccentric." },
      { exerciseId: "dumbbell-row-preset", title: "Single-Arm Dumbbell Row", type: "strength", reps: "3 x 10", target: "Lats", equipment: "Dumbbell, bench", guidance: "Brace on the bench, row to your hip, and keep your core tight." },
    ],
    triceps: [
      { exerciseId: "close-grip-bench-preset", title: "Close-Grip Bench Press", type: "strength", reps: "4 x 8", target: "Triceps", equipment: "Barbell, bench", guidance: "Keep hands shoulder-width apart and elbows tucked close to your body." },
      { exerciseId: "tricep-dips-preset", title: "Tricep Dips", type: "strength", reps: "3 x 10", target: "Triceps", equipment: "Dip station", guidance: "Stay upright, lower until elbows are at 90°, and press back up explosively." },
      { exerciseId: "overhead-extension-preset", title: "Overhead Tricep Extension", type: "strength", reps: "3 x 12", target: "Long head", equipment: "Dumbbell", guidance: "Keep your elbows pointed forward and extend fully overhead." },
      { exerciseId: "rope-pushdown-preset", title: "Rope Pushdown", type: "strength", reps: "3 x 12", target: "Lateral head", equipment: "Cable machine", guidance: "Spread the rope at the bottom and squeeze your triceps hard at full extension." },
      { exerciseId: "skull-crusher-preset", title: "Skull Crushers", type: "strength", reps: "3 x 10", target: "Triceps", equipment: "EZ bar, bench", guidance: "Lower the bar to your forehead, keep elbows still, and extend with control." },
      { exerciseId: "kickback-preset", title: "Dumbbell Kickback", type: "strength", reps: "3 x 12", target: "Triceps", equipment: "Dumbbells", guidance: "Hinge forward, lock your upper arm, and extend fully behind you." },
    ],
    shoulders: [
      { exerciseId: "overhead-press-preset", title: "Barbell Overhead Press", type: "strength", reps: "4 x 8", target: "Shoulders", equipment: "Barbell", guidance: "Brace your core, press straight overhead, and lock out at the top." },
      { exerciseId: "lateral-raise-preset", title: "Lateral Raise", type: "strength", reps: "3 x 12", target: "Side delts", equipment: "Dumbbells", guidance: "Raise to shoulder height with a slight bend in the elbows, lower slowly." },
      { exerciseId: "face-pull-preset", title: "Face Pull", type: "strength", reps: "3 x 15", target: "Rear delts", equipment: "Cable machine", guidance: "Pull the rope to your face, flare your elbows out, and squeeze your rear delts." },
      { exerciseId: "arnold-press-preset", title: "Arnold Press", type: "strength", reps: "3 x 10", target: "All delts", equipment: "Dumbbells", guidance: "Start palms facing you, rotate as you press up, and reverse on the way down." },
      { exerciseId: "front-raise-preset", title: "Front Raise", type: "strength", reps: "3 x 12", target: "Front delts", equipment: "Dumbbells", guidance: "Raise one arm at a time to eye level with a controlled tempo." },
      { exerciseId: "rear-delt-fly-preset", title: "Rear Delt Fly", type: "strength", reps: "3 x 12", target: "Rear delts", equipment: "Dumbbells", guidance: "Hinge forward, fly your arms out wide, and squeeze your shoulder blades." },
    ],
    legs: [
      { exerciseId: "barbell-squat-preset", title: "Barbell Back Squat", type: "strength", reps: "4 x 8", target: "Quads", equipment: "Barbell, squat rack", guidance: "Brace your core, sit back and down, and drive through your whole foot." },
      { exerciseId: "romanian-deadlift-preset", title: "Romanian Deadlift", type: "strength", reps: "3 x 10", target: "Hamstrings", equipment: "Barbell", guidance: "Push your hips back, keep the bar close to your legs, and feel the hamstring stretch.", sessionVideoSrc: exerciseVideoById["romanian-deadlift-preset"] },
      { exerciseId: "leg-press-preset", title: "Leg Press", type: "strength", reps: "3 x 12", target: "Quads", equipment: "Leg press machine", guidance: "Place feet shoulder-width apart and press without locking your knees." },
      { exerciseId: "walking-lunge-preset", title: "Walking Lunges", type: "strength", reps: "3 x 12", target: "Glutes", equipment: "Dumbbells", guidance: "Take a big step forward, drop your back knee gently, and push through the front heel.", sessionVideoSrc: exerciseVideoById["walking-lunge-preset"] },
      { exerciseId: "leg-curl-preset", title: "Lying Leg Curl", type: "strength", reps: "3 x 12", target: "Hamstrings", equipment: "Leg curl machine", guidance: "Curl slowly, squeeze at the top, and control the negative." },
      { exerciseId: "calf-raise-preset", title: "Standing Calf Raise", type: "strength", reps: "4 x 15", target: "Calves", equipment: "Calf raise machine", guidance: "Rise up onto your toes fully, pause at the peak, and lower with a stretch.", sessionVideoSrc: exerciseVideoById["calf-raise-preset"] },
    ],
    core: [
      { exerciseId: "plank-preset", title: "Plank", type: "strength", reps: "3 x 45 sec", target: "Core", equipment: "Bodyweight", guidance: "Keep a straight line from head to heels and brace your abs tight." },
      { exerciseId: "hanging-leg-raise-preset", title: "Hanging Leg Raise", type: "strength", reps: "3 x 12", target: "Lower abs", equipment: "Pull-up bar", guidance: "Hang with straight arms, raise your legs to 90°, and lower without swinging." },
      { exerciseId: "cable-woodchop-preset", title: "Cable Woodchop", type: "strength", reps: "3 x 12", target: "Obliques", equipment: "Cable machine", guidance: "Rotate from your hips, keep arms extended, and control the return." },
      { exerciseId: "ab-wheel-preset", title: "Ab Wheel Rollout", type: "strength", reps: "3 x 10", target: "Core", equipment: "Ab wheel", guidance: "Roll out slowly with a flat back and pull back using your abs, not your hips." },
      { exerciseId: "russian-twist-preset", title: "Russian Twist", type: "strength", reps: "3 x 20", target: "Obliques", equipment: "Dumbbell", guidance: "Lean back slightly, rotate side to side, and keep your feet off the ground." },
      { exerciseId: "dead-bug-preset", title: "Dead Bug", type: "strength", reps: "3 x 12", target: "Deep core", equipment: "Bodyweight", guidance: "Press your lower back into the floor and extend opposite arm and leg slowly.", sessionVideoSrc: exerciseVideoById["dead-bug-preset"] },
    ],
  };

  const extraGymWorkoutsByFocus: Record<MuscleFocus, WorkoutPreset[]> = {
    chest: [
      { exerciseId: "incline-barbell-bench-preset", title: "Incline Barbell Bench Press", type: "strength", reps: "4 x 8", target: "Upper chest", equipment: "Barbell, incline bench", guidance: "Press with a steady bar path and keep your shoulder blades pinned back." },
      { exerciseId: "pec-deck-fly-preset", title: "Pec Deck Fly", type: "strength", reps: "3 x 12", target: "Inner chest", equipment: "Pec deck machine", guidance: "Lead with the elbows, squeeze at the center, and control the opening phase." },
      { exerciseId: "smith-machine-press-preset", title: "Smith Machine Press", type: "strength", reps: "3 x 10", target: "Chest", equipment: "Smith machine, bench", guidance: "Lower to mid chest and press with a smooth, controlled tempo." },
      { exerciseId: "low-to-high-cable-fly-preset", title: "Low to High Cable Fly", type: "strength", reps: "3 x 12", target: "Upper chest", equipment: "Cable machine", guidance: "Sweep upward in a wide arc and pause lightly at the top." },
    ],
    biceps: [],
    back: [
      { exerciseId: "t-bar-row-preset", title: "T-Bar Row", type: "strength", reps: "4 x 8", target: "Mid back", equipment: "T-bar row machine", guidance: "Brace your torso, pull to the lower chest, and squeeze the upper back hard." },
      { exerciseId: "chest-supported-row-preset", title: "Chest Supported Row", type: "strength", reps: "3 x 10", target: "Upper back", equipment: "Machine or incline bench", guidance: "Drive elbows back and pause at the top without shrugging." },
      { exerciseId: "straight-arm-pulldown-preset", title: "Straight-Arm Pulldown", type: "strength", reps: "3 x 12", target: "Lats", equipment: "Cable machine", guidance: "Keep arms long and pull through the lats, not the triceps." },
      { exerciseId: "rack-pull-preset", title: "Rack Pull", type: "strength", reps: "4 x 6", target: "Upper back", equipment: "Barbell, rack", guidance: "Set the bar just below the knees and finish with the chest tall and lats tight." },
    ],
    triceps: [
      { exerciseId: "cable-overhead-extension-preset", title: "Cable Overhead Extension", type: "strength", reps: "3 x 12", target: "Long head", equipment: "Cable machine", guidance: "Keep elbows narrow and extend fully without arching your back." },
      { exerciseId: "reverse-grip-pushdown-preset", title: "Reverse Grip Pushdown", type: "strength", reps: "3 x 12", target: "Medial head", equipment: "Cable machine", guidance: "Use an underhand grip and press down with strict elbow control." },
      { exerciseId: "dip-machine-preset", title: "Dip Machine", type: "strength", reps: "3 x 10", target: "Triceps", equipment: "Dip machine", guidance: "Stay upright and drive through the palms without bouncing." },
      { exerciseId: "single-arm-pushdown-preset", title: "Single-Arm Pushdown", type: "strength", reps: "3 x 12", target: "Triceps", equipment: "Cable machine", guidance: "Lock the elbow to your side and finish each rep fully." },
    ],
    shoulders: [
      { exerciseId: "machine-shoulder-press-preset", title: "Machine Shoulder Press", type: "strength", reps: "4 x 10", target: "Shoulders", equipment: "Shoulder press machine", guidance: "Press smoothly overhead and lower only to shoulder height." },
      { exerciseId: "upright-row-preset", title: "Upright Row", type: "strength", reps: "3 x 12", target: "Delts", equipment: "EZ bar", guidance: "Lead with the elbows and stop when upper arms reach shoulder level." },
      { exerciseId: "cable-lateral-raise-preset", title: "Cable Lateral Raise", type: "strength", reps: "3 x 12", target: "Side delts", equipment: "Cable machine", guidance: "Use one arm at a time and keep tension through the full arc." },
      { exerciseId: "reverse-pec-deck-preset", title: "Reverse Pec Deck", type: "strength", reps: "3 x 15", target: "Rear delts", equipment: "Pec deck machine", guidance: "Keep chest tall and open the arms wide without shrugging." },
    ],
    legs: [
      { exerciseId: "hack-squat-preset", title: "Hack Squat", type: "strength", reps: "4 x 8", target: "Quads", equipment: "Hack squat machine", guidance: "Stay braced, lower deep, and drive through mid-foot to stand." },
      { exerciseId: "bulgarian-split-squat-preset", title: "Bulgarian Split Squat", type: "strength", reps: "3 x 10", target: "Glutes", equipment: "Bench, dumbbells", guidance: "Keep your torso slightly forward and sink straight down with control." },
      { exerciseId: "leg-extension-preset", title: "Leg Extension", type: "strength", reps: "3 x 15", target: "Quads", equipment: "Leg extension machine", guidance: "Lift with control, pause at the top, and lower slowly." },
      { exerciseId: "hip-thrust-preset", title: "Hip Thrust", type: "strength", reps: "4 x 10", target: "Glutes", equipment: "Barbell, bench", guidance: "Keep the ribs down and drive hips up until you reach full extension." },
    ],
    core: [
      { exerciseId: "cable-crunch-preset", title: "Cable Crunch", type: "strength", reps: "3 x 15", target: "Abs", equipment: "Cable machine", guidance: "Curl your ribs toward your hips and keep tension on the abs throughout." },
      { exerciseId: "decline-sit-up-preset", title: "Decline Sit-Up", type: "strength", reps: "3 x 12", target: "Upper abs", equipment: "Decline bench", guidance: "Roll up through the spine instead of throwing your torso forward." },
      { exerciseId: "pallof-press-preset", title: "Pallof Press", type: "strength", reps: "3 x 12", target: "Anti-rotation", equipment: "Cable machine", guidance: "Brace hard and press straight out without letting the torso twist." },
      { exerciseId: "hanging-knee-raise-preset", title: "Hanging Knee Raise", type: "strength", reps: "3 x 12", target: "Lower abs", equipment: "Pull-up bar", guidance: "Curl the knees up with the abs and control the descent." },
    ],
  };

  const homeWorkoutsByFocus: Record<MuscleFocus, WorkoutPreset[]> = {
    chest: [
      { exerciseId: "floor-press-home-preset", title: "Dumbbell Floor Press", type: "strength", reps: "4 x 10", target: "Chest", equipment: "Dumbbells", guidance: "Lower until your triceps touch the floor, pause briefly, and press back up with control.", sessionVideoSrc: exerciseVideoById["floor-press-home-preset"] },
      { exerciseId: "push-up-home-preset", title: "Push-Up", type: "strength", reps: "3 x 12", target: "Chest", equipment: "Bodyweight", guidance: "Keep your body in one straight line and lower chest-first before pressing back up.", sessionVideoSrc: exerciseVideoById["push-up-home-preset"] },
      { exerciseId: "band-chest-press-home-preset", title: "Resistance Band Chest Press", type: "strength", reps: "3 x 15", target: "Chest", equipment: "Resistance band", guidance: "Anchor the band securely and drive forward evenly through both hands.", sessionVideoSrc: exerciseVideoById["band-chest-press-home-preset"] },
      { exerciseId: "dumbbell-fly-home-preset", title: "Dumbbell Fly", type: "strength", reps: "3 x 12", target: "Stretch", equipment: "Dumbbells", guidance: "Open wide with a soft elbow bend and squeeze back through the chest.", sessionVideoSrc: exerciseVideoById["dumbbell-fly-home-preset"] },
      { exerciseId: "incline-push-up-home-preset", title: "Incline Push-Up", type: "strength", reps: "3 x 12", target: "Upper chest", equipment: "Bench or chair", guidance: "Use a stable surface, keep elbows softly tucked, and move through a full range.", sessionVideoSrc: exerciseVideoById["incline-push-up-home-preset"] },
      { exerciseId: "band-fly-home-preset", title: "Resistance Band Fly", type: "strength", reps: "3 x 15", target: "Inner chest", equipment: "Resistance band", guidance: "Keep a slight bend in the elbows and bring the hands together with control.", sessionVideoSrc: exerciseVideoById["band-fly-home-preset"] },
    ],
    biceps: [
      { exerciseId: "dumbbell-bicep-curl-home-preset", title: "Dumbbell Bicep Curl", type: "strength", reps: "4 x 10", target: "Biceps", equipment: "Dumbbells", guidance: "Keep elbows pinned to your sides and curl without swinging your torso." },
      { exerciseId: "hammer-curl-home-preset", title: "Hammer Curl", type: "strength", reps: "3 x 12", target: "Brachialis", equipment: "Dumbbells", guidance: "Use a neutral grip and squeeze hard at the top of each rep." },
      { exerciseId: "concentration-curl-home-preset", title: "Concentration Curl", type: "strength", reps: "3 x 12", target: "Peak", equipment: "Dumbbell", guidance: "Brace your elbow against your thigh and curl with strict control." },
      { exerciseId: "resistance-band-curl-home-preset", title: "Resistance Band Curl", type: "strength", reps: "3 x 15", target: "Biceps", equipment: "Resistance band", guidance: "Stand evenly on the band and keep smooth tension through the full curl." },
      { exerciseId: "cross-body-hammer-curl-home-preset", title: "Cross-Body Hammer Curl", type: "strength", reps: "3 x 12", target: "Outer arm", equipment: "Dumbbells", guidance: "Curl one hand across the body toward the opposite shoulder and lower slowly.", sessionVideoSrc: exerciseVideoById["hammer-curl-preset"] },
      { exerciseId: "reverse-curl-home-preset", title: "Reverse Curl", type: "strength", reps: "3 x 12", target: "Forearm", equipment: "Dumbbells or band", guidance: "Use an overhand grip, keep wrists steady, and control the lowering phase." },
    ],
    back: [
      { exerciseId: "one-arm-dumbbell-row-home-preset", title: "One-Arm Dumbbell Row", type: "strength", reps: "4 x 10", target: "Lats", equipment: "Dumbbell", guidance: "Brace your torso, row toward your hip, and avoid twisting through the spine.", sessionVideoSrc: exerciseVideoById["one-arm-dumbbell-row-home-preset"] },
      { exerciseId: "resistance-band-row-home-preset", title: "Resistance Band Row", type: "strength", reps: "3 x 15", target: "Mid back", equipment: "Resistance band", guidance: "Sit or stand tall, pull elbows back, and squeeze shoulder blades together.", sessionVideoSrc: exerciseVideoById["resistance-band-row-home-preset"] },
      { exerciseId: "dumbbell-deadlift-home-preset", title: "Dumbbell Deadlift", type: "strength", reps: "3 x 12", target: "Posterior chain", equipment: "Dumbbells", guidance: "Hinge at the hips, keep the weights close to your legs, and stand tall with control.", sessionVideoSrc: exerciseVideoById["dumbbell-deadlift-home-preset"] },
      { exerciseId: "bent-over-row-home-preset", title: "Bent-Over Row", type: "strength", reps: "3 x 12", target: "Upper back", equipment: "Dumbbells", guidance: "Keep a flat back, row toward the lower ribs, and pause briefly at the top.", sessionVideoSrc: exerciseVideoById["bent-over-row-home-preset"] },
      { exerciseId: "band-lat-pulldown-home-preset", title: "Resistance Band Lat Pulldown", type: "strength", reps: "3 x 15", target: "Lats", equipment: "Resistance band", guidance: "Anchor high, pull elbows down to your ribs, and control the return.", sessionVideoSrc: exerciseVideoById["band-lat-pulldown-home-preset"] },
      { exerciseId: "superman-hold-home-preset", title: "Superman Hold", type: "strength", reps: "3 x 30 sec", target: "Lower back", equipment: "Bodyweight", guidance: "Lift chest and legs gently off the floor and hold with a long neck and tight core.", sessionVideoSrc: exerciseVideoById["superman-hold-home-preset"] },
    ],
    triceps: [
      { exerciseId: "overhead-dumbbell-extension-home-preset", title: "Overhead Dumbbell Extension", type: "strength", reps: "4 x 10", target: "Long head", equipment: "Dumbbell", guidance: "Point elbows forward, lower behind the head, and extend fully without flaring.", sessionVideoSrc: exerciseVideoById["overhead-dumbbell-extension-home-preset"] },
      { exerciseId: "tricep-kickback-home-preset", title: "Tricep Kickback", type: "strength", reps: "3 x 12", target: "Triceps", equipment: "Dumbbells", guidance: "Hinge forward, keep upper arms still, and extend fully behind you.", sessionVideoSrc: exerciseVideoById["tricep-kickback-home-preset"] },
      { exerciseId: "close-grip-push-up-home-preset", title: "Close-Grip Push-Up", type: "strength", reps: "3 x 10", target: "Bodyweight press", equipment: "Bodyweight", guidance: "Keep hands narrow and elbows tucked as you lower and press back up.", sessionVideoSrc: exerciseVideoById["close-grip-push-up-home-preset"] },
      { exerciseId: "resistance-band-pushdown-home-preset", title: "Resistance Band Pushdown", type: "strength", reps: "3 x 15", target: "Lateral head", equipment: "Resistance band", guidance: "Anchor high, keep elbows pinned, and press down hard through each rep.", sessionVideoSrc: exerciseVideoById["resistance-band-pushdown-home-preset"] },
      { exerciseId: "dumbbell-skull-crusher-home-preset", title: "Dumbbell Skull Crusher", type: "strength", reps: "3 x 12", target: "Triceps", equipment: "Dumbbells", guidance: "Lower the weights beside your head and extend without moving your elbows around.", sessionVideoSrc: exerciseVideoById["dumbbell-skull-crusher-home-preset"] },
      { exerciseId: "bench-dip-home-preset", title: "Bench Dip", type: "strength", reps: "3 x 12", target: "Triceps", equipment: "Bench or chair", guidance: "Use a stable surface, lower with control, and keep shoulders down away from the ears.", sessionVideoSrc: exerciseVideoById["bench-dip-home-preset"] },
    ],
    shoulders: [
      { exerciseId: "dumbbell-shoulder-press-home-preset", title: "Dumbbell Shoulder Press", type: "strength", reps: "4 x 10", target: "Shoulders", equipment: "Dumbbells", guidance: "Brace your core, press straight up, and lower smoothly to shoulder level.", sessionVideoSrc: exerciseVideoById["dumbbell-shoulder-press-home-preset"] },
      { exerciseId: "lateral-raise-home-preset", title: "Lateral Raise", type: "strength", reps: "3 x 12", target: "Side delts", equipment: "Dumbbells", guidance: "Lift with control to shoulder height and lower slowly.", sessionVideoSrc: exerciseVideoById["lateral-raise-home-preset"] },
      { exerciseId: "front-raise-home-preset", title: "Front Raise", type: "strength", reps: "3 x 12", target: "Front delts", equipment: "Dumbbells", guidance: "Raise with soft elbows and keep your ribs down.", sessionVideoSrc: exerciseVideoById["front-raise-home-preset"] },
      { exerciseId: "resistance-band-face-pull-home-preset", title: "Resistance Band Face Pull", type: "strength", reps: "3 x 15", target: "Rear delts", equipment: "Resistance band", guidance: "Pull to your face with elbows high and squeeze your upper back.", sessionVideoSrc: exerciseVideoById["resistance-band-face-pull-home-preset"] },
      { exerciseId: "arnold-press-home-preset", title: "Arnold Press", type: "strength", reps: "3 x 10", target: "All delts", equipment: "Dumbbells", guidance: "Rotate as you press and keep the movement smooth and controlled.", sessionVideoSrc: exerciseVideoById["arnold-press-home-preset"] },
      { exerciseId: "rear-delt-fly-home-preset", title: "Rear Delt Fly", type: "strength", reps: "3 x 12", target: "Rear delts", equipment: "Dumbbells", guidance: "Hinge forward, sweep arms out wide, and squeeze through the upper back.", sessionVideoSrc: exerciseVideoById["rear-delt-fly-home-preset"] },
    ],
    legs: [
      { exerciseId: "goblet-squat-home-preset", title: "Goblet Squat", type: "strength", reps: "4 x 10", target: "Quads", equipment: "Dumbbell", guidance: "Hold the weight close, sit between your hips, and drive up through the whole foot.", sessionVideoSrc: exerciseVideoById["goblet-squat-home-preset"] },
      { exerciseId: "dumbbell-lunges-home-preset", title: "Dumbbell Lunges", type: "strength", reps: "3 x 12", target: "Leg drive", equipment: "Dumbbells", guidance: "Take a controlled step, lower straight down, and push through the front heel.", sessionVideoSrc: exerciseVideoById["dumbbell-lunges-home-preset"] },
      { exerciseId: "romanian-deadlift-home-preset", title: "Romanian Deadlift", type: "strength", reps: "3 x 12", target: "Hamstrings", equipment: "Dumbbells", guidance: "Push hips back, keep a soft knee bend, and feel the hamstring stretch.", sessionVideoSrc: exerciseVideoById["romanian-deadlift-home-preset"] },
      { exerciseId: "resistance-band-squat-home-preset", title: "Resistance Band Squat", type: "strength", reps: "3 x 15", target: "Quads", equipment: "Resistance band", guidance: "Keep tension on the band, sit back and down, and drive up under control.", sessionVideoSrc: exerciseVideoById["resistance-band-squat-home-preset"] },
      { exerciseId: "glute-bridge-home-preset", title: "Glute Bridge", type: "strength", reps: "3 x 15", target: "Posterior chain", equipment: "Bodyweight", guidance: "Tuck your ribs down, squeeze your glutes at the top, and lower slowly.", sessionVideoSrc: exerciseVideoById["glute-bridge-home-preset"] },
      { exerciseId: "calf-raise-home-preset", title: "Standing Calf Raise", type: "strength", reps: "4 x 18", target: "Calves", equipment: "Bodyweight", guidance: "Rise high onto your toes, pause, and lower under control.", sessionVideoSrc: exerciseVideoById["calf-raise-home-preset"] },
    ],
    core: [
      { exerciseId: "plank-home-preset", title: "Plank", type: "strength", reps: "3 x 45 sec", target: "Core", equipment: "Bodyweight", guidance: "Brace your abs and keep a straight line from shoulders to heels." },
      { exerciseId: "dead-bug-home-preset", title: "Dead Bug", type: "strength", reps: "3 x 12", target: "Deep core", equipment: "Bodyweight", guidance: "Keep your lower back pressed to the floor and move slowly.", sessionVideoSrc: exerciseVideoById["dead-bug-home-preset"] },
      { exerciseId: "side-plank-home-preset", title: "Side Plank", type: "strength", reps: "3 x 30 sec", target: "Obliques", equipment: "Bodyweight", guidance: "Lift the hips high and keep your body stacked in one line.", sessionVideoSrc: exerciseVideoById["side-plank-home-preset"] },
      { exerciseId: "mountain-climber-home-preset", title: "Mountain Climber", type: "conditioning", reps: "3 x 30 sec", target: "Conditioning", equipment: "Bodyweight", guidance: "Drive knees fast without bouncing your hips.", sessionVideoSrc: exerciseVideoById["mountain-climber-home-preset"] },
      { exerciseId: "hollow-hold-home-preset", title: "Hollow Hold", type: "strength", reps: "3 x 25 sec", target: "Abs", equipment: "Bodyweight", guidance: "Flatten your lower back and keep arms and legs long.", sessionVideoSrc: exerciseVideoById["hollow-hold-home-preset"] },
      { exerciseId: "bird-dog-home-preset", title: "Bird Dog", type: "strength", reps: "3 x 10 each side", target: "Core stability", equipment: "Bodyweight", guidance: "On all fours, reach one arm forward and the opposite leg back, hold a beat, then switch sides.", sessionVideoSrc: exerciseVideoById["bird-dog-home-preset"] },
    ],
  };

  const customGymWorkoutsForDate = customGymWorkoutsByDate[selectedDate] ?? [];
  const savedGymRoutineForFocus = savedGymRoutinesByFocus[muscleFocus] ?? null;
  const draftGymRoutineForDate = draftGymRoutinesByDate[selectedDate] ?? null;
  // A saved custom routine (e.g. "Mix 3") is a named entity, decoupled from the
  // muscle-focus groups. When one is selected for the day it drives the workout.
  const selectedCustomRoutineId = selectedCustomRoutineByDate[selectedDate] ?? "";
  const activeCustomRoutine =
    selectedWorkoutEnvironment === "gym"
      ? savedCustomRoutines.find((routine) => routine.id === selectedCustomRoutineId) ?? null
      : null;
  const unsavedGymRoutineExercises = [
    ...(gymWorkoutsByFocus[muscleFocus] ?? gymWorkoutsByFocus.chest),
    ...customGymWorkoutsForDate,
  ];
  const gymRoutineExercises =
    (activeCustomRoutine?.exercises as WorkoutPreset[] | undefined) ??
    savedGymRoutineForFocus ??
    draftGymRoutineForDate ??
    unsavedGymRoutineExercises;
  const activeCustomRoutineName = activeCustomRoutine?.name ?? "";
  const workoutsByFocus =
    selectedWorkoutEnvironment === "home"
      ? homeWorkoutsByFocus
      : gymWorkoutsByFocus;
  const baseFocusExercises =
    selectedWorkoutEnvironment === "home"
      ? [
          ...(workoutsByFocus[muscleFocus] ?? workoutsByFocus.chest),
          // Finishers added from muscle coverage sit after the preset list and
          // survive the exercise limit below, so adding one always shows up.
          ...customGymWorkoutsForDate,
        ]
      : gymRoutineExercises;
  const focusExercises =
    selectedWorkoutEnvironment === "home" && isPro && readinessAdjustment
      ? selectAdaptedExercises(
          baseFocusExercises,
          readinessAdjustment,
          (exercise) => `${exercise.title} ${exercise.target}`,
        ).map((exercise) => adaptExerciseForReadiness(exercise, readinessAdjustment))
      : baseFocusExercises;
  const todayWorkoutCards = focusExercises.map((exercise, index) => ({
    ...exercise,
    icon: getExerciseCardIcon(exercise.title, exercise.type),
    progressWidth: `${Math.max(72, 84 - index * 3)}%`,
    ...shellStyles[index % shellStyles.length],
  }));
  // A custom routine isn't tied to one muscle group, so offer exercises from
  // every group; a normal focus day offers just that group's exercises.
  const availableGymWorkouts = (
    activeCustomRoutine
      ? MUSCLE_FOCUS_VALUES.flatMap((focus) => [
          ...(gymWorkoutsByFocus[focus] ?? []),
          ...(extraGymWorkoutsByFocus[focus] ?? []),
        ])
      : [
          ...(gymWorkoutsByFocus[muscleFocus] ?? gymWorkoutsByFocus.chest),
          ...(extraGymWorkoutsByFocus[muscleFocus] ?? []),
        ]
  ).filter(
    (exercise, index, array) =>
      array.findIndex((currentExercise) => currentExercise.exerciseId === exercise.exerciseId) ===
      index,
  );
  const addableGymWorkouts = availableGymWorkouts.filter(
    (exercise) =>
      !baseFocusExercises.some(
        (currentExercise) => currentExercise.exerciseId === exercise.exerciseId,
      ),
  );
  const isSavedGymRoutineCurrent =
    selectedWorkoutEnvironment === "gym" &&
    savedGymRoutineForFocus !== null &&
    savedGymRoutineForFocus.length === baseFocusExercises.length &&
    savedGymRoutineForFocus.every(
      (savedExercise, index) =>
        savedExercise.exerciseId === baseFocusExercises[index]?.exerciseId,
    );
  const allWorkoutCards = todayWorkoutCards.map((exercise) => ({
    exerciseId: exercise.exerciseId,
    sessionId: selectedSession?.id ?? "",
    sessionDate: selectedDate,
    sessionTitle: selectedSession?.title ?? "Workout",
    title: exercise.title,
    type: exercise.type,
    icon: exercise.icon,
    valueLabel: exercise.reps,
    targetLabel: exercise.target,
    guidance: exercise.guidance,
    equipmentLabel: exercise.equipment,
    // Presets that spell the video out win; everything else is resolved by id
    // and then by name, so a clip added to the CSV reaches the screen without
    // the preset row having to be edited to match.
    sessionVideoSrc:
      exercise.sessionVideoSrc ?? findExerciseVideo(exercise.exerciseId, exercise.title),
    progressWidth: exercise.progressWidth,
    shellClass: exercise.shellClass,
    barClass: exercise.barClass,
  }));
  const openGymMenuExercise = allWorkoutCards.find(
    (exercise) => exercise.exerciseId === openGymMenuExerciseId,
  );
  const syncGymSetToHistory = (
    exercise: (typeof allWorkoutCards)[number],
    setNumber: number,
    setDraft: GymSetDraft,
  ) => {
    logWorkoutLoad({
      sessionDate: exercise.sessionDate,
      sessionId: exercise.sessionId,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.title,
      setNumber,
      reps: setDraft.reps || null,
      loadValue: setDraft.load,
      loadUnit: "kg",
    });
  };
  const hasLoggedGymSetForExercise = (exercise: (typeof allWorkoutCards)[number]) =>
    state.workoutLoadLogs.some(
      (log) =>
        log.sessionDate === exercise.sessionDate &&
        log.exerciseId === exercise.exerciseId &&
        (!exercise.sessionId || !log.sessionId || log.sessionId === exercise.sessionId),
    );
  const isGymExerciseLogged = (exercise: (typeof allWorkoutCards)[number]) =>
    state.workoutLogs.some(
      (log) =>
        log.sessionDate === exercise.sessionDate &&
        (!exercise.sessionId || log.sessionId === exercise.sessionId) &&
        log.exercisesCompleted.includes(exercise.exerciseId),
    ) || hasLoggedGymSetForExercise(exercise);
  const hasLoggedWorkoutForDate = (dateIso: string) =>
    state.workoutLogs.some(
      (log) =>
        log.sessionDate === dateIso &&
        (log.completedSession || log.exercisesCompleted.length > 0),
    ) || state.workoutLoadLogs.some((log) => log.sessionDate === dateIso);
  const getPriorSessionSetLogs = (exercise: (typeof allWorkoutCards)[number]) => {
    const priorSessionDate = state.workoutLoadLogs
      .filter(
        (log) =>
          log.exerciseId === exercise.exerciseId && log.sessionDate < exercise.sessionDate,
      )
      .map((log) => log.sessionDate)
      .sort()
      .at(-1);

    if (!priorSessionDate) {
      return [];
    }

    return state.workoutLoadLogs.filter(
      (log) =>
        log.exerciseId === exercise.exerciseId && log.sessionDate === priorSessionDate,
    );
  };
  const getInitialGymSetDrafts = (exercise: (typeof allWorkoutCards)[number]) => {
    const scheme = parseSetScheme(exercise.valueLabel);
    const baseLoadValue =
      selectedWorkoutEnvironment === "home" ? getHomeDefaultLoad(exercise) : getBaseGymLoadValue();
    const loggedSets = state.workoutLoadLogs
      .filter(
        (log) =>
          log.sessionDate === exercise.sessionDate &&
          log.exerciseId === exercise.exerciseId &&
          (!exercise.sessionId || !log.sessionId || log.sessionId === exercise.sessionId),
      )
      .sort((a, b) => a.setNumber - b.setNumber);
    const priorSets = getPriorSessionSetLogs(exercise);
    const isExerciseCompleted = isGymExerciseLogged(exercise);
    const setCount =
      loggedSets.length > 0
        ? Math.max(scheme.sets, loggedSets.at(-1)?.setNumber ?? 0)
        : 1;

    return Array.from({ length: setCount }, (_, index) => {
      const setNumber = index + 1;
      const loggedSet = loggedSets.find((log) => log.setNumber === index + 1);
      const priorSet = priorSets.find((log) => log.setNumber === setNumber);
      const completionKey = getGymSetCompletionKey(
        exercise.sessionDate,
        exercise.exerciseId,
        setNumber,
      );

      return {
        reps: loggedSet?.reps ?? priorSet?.reps ?? scheme.reps,
        load:
          selectedWorkoutEnvironment === "home"
            ? normalizeHomeLoadValue(loggedSet?.loadValue ?? priorSet?.loadValue ?? baseLoadValue)
            : loggedSet?.loadValue ?? priorSet?.loadValue ?? baseLoadValue,
        completed: completedGymSetKeys[completionKey] ?? isExerciseCompleted,
        touched: Boolean(loggedSet || priorSet),
      };
    });
  };
  const getGymSetDrafts = (exercise: (typeof allWorkoutCards)[number]) => {
    const draftKey = getGymSetDraftKey(exercise.sessionDate, exercise.exerciseId);

    const drafts = gymSetDraftsByExercise[draftKey] ?? getInitialGymSetDrafts(exercise);

    if (selectedWorkoutEnvironment !== "home") {
      return drafts;
    }

    return drafts.map((setDraft) => ({
      ...setDraft,
      load: normalizeHomeLoadValue(setDraft.load),
    }));
  };
  const loggedGymWorkoutCount = allWorkoutCards.filter((exercise) =>
    isGymExerciseLogged(exercise) ||
    getGymSetDrafts(exercise).some((setDraft) => setDraft.completed),
  ).length;
  const sessionId = selectedSession?.id ?? "";
  const allIds = allWorkoutCards.map((exercise) => exercise.exerciseId);
  const allDone =
    allIds.length > 0 &&
    allWorkoutCards.every((exercise) => isGymExerciseLogged(exercise));
  const hasAnyWorkoutProgress =
    selectedWorkoutEnvironment === "gym"
      ? loggedGymWorkoutCount > 0
      : homeElapsedSeconds > 0 || homeWarmupMarkedDone;
  const hasHitProteinTarget =
    Boolean(state.nutritionTargets) &&
    todayNutrition.proteinG >= (state.nutritionTargets?.proteinG ?? Infinity) * 0.8;
  const dailyQuests: DailyQuestItem[] = [
    {
      id: "complete-workout",
      label: "Complete workout",
      completed: allDone || homeElapsedSeconds >= homeTotalSeconds,
      icon: Flame,
    },
    {
      id: "protein",
      label: "Hit protein pace",
      completed: hasHitProteinTarget,
      icon: Dumbbell,
    },
    {
      id: "hydrate",
      label: "Hydrate 2L",
      completed: todayWaterMl >= 2000,
      icon: Droplets,
    },
  ];
  const muscleCoverage = getMuscleCoverage({
    workoutLogs: state.workoutLogs,
    workoutLoadLogs: state.workoutLoadLogs,
    today: todayIso,
  });
  const muscleCoverageScore = getMuscleCoverageScore(muscleCoverage);
  // Sessions completed against the days per week the profile asked for -- the
  // one number on this screen that spans more than today.
  const goalCycle = state.profile ? getGoalCycle(state.profile, todayIso) : null;
  const proteinTargetG = Math.round(state.nutritionTargets?.proteinG ?? 0);
  const completedQuestCount = dailyQuests.filter((quest) => quest.completed).length;
  const isHomeWorkoutCompleted =
    selectedWorkoutEnvironment === "home" && (allDone || isHomeSessionComplete);
  const isHomeWarmupComplete = homeWarmupMarkedDone || isHomeWorkoutCompleted;
  // Stretching is done once it's marked, once the clock has run past it, or
  // when the session has no stretching block at all. Warm-up only becomes the
  // current step (and shows its button) after this.
  const isHomeStretchComplete =
    isHomeWarmupComplete ||
    homeStretchMarkedDone ||
    homeStretchingSeconds <= 0 ||
    homeElapsedSeconds >= homeStretchingSeconds;
  // The resolved shape decides how many exercises fit: the warm-up block plus
  // roughly five minutes per movement, never fewer than MIN_HOME_EXERCISES.
  const homeExerciseLimit = homeSessionShape.exerciseCount;
  const homeFinisherCount =
    selectedWorkoutEnvironment === "home" ? customGymWorkoutsForDate.length : 0;
  const homeSessionCards = [
    ...allWorkoutCards
      .slice(0, Math.max(0, allWorkoutCards.length - homeFinisherCount))
      .slice(0, homeExerciseLimit),
    ...allWorkoutCards.slice(allWorkoutCards.length - homeFinisherCount),
  ];
  const homeWorkoutStepCount = homeSessionCards.length;
  // Pin the per-exercise slot to HOME_EXERCISE_SLOT_SECONDS so the timeline
  // labels and the actual milestones are on the same clock. The remainder
  // between (warmup + slots × steps + rests) and homeTotalSeconds becomes
  // the finish buffer.
  const homeWorkoutStepSeconds = HOME_EXERCISE_SLOT_SECONDS;
  const homeRestSlotSeconds = homeSessionShape.restSlotSeconds;
  const homeRestAfterIndices = new Set(homeSessionShape.restAfterExerciseIndices);

  type HomeTimelineMilestone =
    | {
        id: string;
        timeSeconds: number;
        timeLabel: string;
        title: string;
        detail: string;
        kind: "prep" | "warmup" | "rest" | "finish";
      }
    | {
        id: string;
        timeSeconds: number;
        timeLabel: string;
        title: string;
        detail: string;
        kind: "workout";
        exercise: (typeof homeSessionCards)[number];
      };

  const homeTimelineMilestones: HomeTimelineMilestone[] = [];
  const homeWorkoutMilestoneSeconds: number[] = [];
  const timeLabelFor = (seconds: number) => `${Math.floor(seconds / 60)}m`;
  let cursorSeconds = 0;

  if (homeStretchingSeconds > 0) {
    homeTimelineMilestones.push({
      id: "stretching",
      timeSeconds: cursorSeconds,
      timeLabel: timeLabelFor(cursorSeconds),
      title: "Stretching",
      detail: `${Math.round(homeStretchingSeconds / 60)}m`,
      kind: "prep",
    });
    cursorSeconds += homeStretchingSeconds;
  }

  const warmupOnlySeconds = Math.max(0, homeWarmupSeconds - homeStretchingSeconds);
  homeTimelineMilestones.push({
    id: "warmup",
    timeSeconds: cursorSeconds,
    timeLabel: timeLabelFor(cursorSeconds),
    title: "Warm-up",
    detail: `${Math.round(warmupOnlySeconds / 60)}m`,
    kind: "warmup",
  });
  cursorSeconds += warmupOnlySeconds;

  homeSessionCards.forEach((exercise, index) => {
    const exerciseNumber = index + 1;
    homeWorkoutMilestoneSeconds.push(cursorSeconds);
    homeTimelineMilestones.push({
      id: `workout-${exerciseNumber}`,
      timeSeconds: cursorSeconds,
      timeLabel: timeLabelFor(cursorSeconds),
      title: exercise.title,
      detail: exercise.valueLabel,
      kind: "workout",
      exercise,
    });
    cursorSeconds += homeWorkoutStepSeconds;

    // Rest placement is fully driven by the shape; some sessions schedule a
    // final rest as a cool-down beat right before the finish marker.
    if (homeRestAfterIndices.has(exerciseNumber) && homeRestSlotSeconds > 0) {
      homeTimelineMilestones.push({
        id: `rest-${exerciseNumber}`,
        timeSeconds: cursorSeconds,
        timeLabel: timeLabelFor(cursorSeconds),
        title: "Rest",
        detail: `${Math.round(homeRestSlotSeconds / 60)}m`,
        kind: "rest",
      });
      cursorSeconds += homeRestSlotSeconds;
    }
  });

  homeTimelineMilestones.push({
    id: "finish",
    timeSeconds: homeTotalSeconds,
    timeLabel: `${Math.round(homeTotalSeconds / 60)}m`,
    title: "Done",
    detail: "",
    kind: "finish",
  });
  // When the session clock leaves a slot, that step is behind you whether or
  // not a set was logged against it -- otherwise the row the timeline calls
  // current runs away from the rows it shows as done.
  const homeMilestoneEndSeconds = (milestoneId: string) => {
    const index = homeTimelineMilestones.findIndex(
      (milestone) => milestone.id === milestoneId,
    );
    const milestone = homeTimelineMilestones[index];
    const next = homeTimelineMilestones[index + 1];
    // Fall back to homeTotalSeconds when the row is the last one before the
    // finish marker.
    return next?.timeSeconds ?? milestone?.timeSeconds ?? homeTotalSeconds;
  };
  const isHomeMilestoneDone = (milestone: (typeof homeTimelineMilestones)[number]) => {
    if (milestone.kind === "finish") {
      return isHomeWorkoutCompleted;
    }

    if (milestone.kind === "prep") {
      return isHomeStretchComplete;
    }

    if (milestone.kind === "warmup") {
      return isHomeWarmupComplete;
    }

    if (milestone.kind === "rest") {
      // Rest is passive — it fades once the clock leaves its slot.
      return (
        isHomeWorkoutCompleted ||
        homeElapsedSeconds >= homeMilestoneEndSeconds(milestone.id)
      );
    }

    return (
      isHomeWorkoutCompleted ||
      homeElapsedSeconds >= homeMilestoneEndSeconds(milestone.id) ||
      ("exercise" in milestone ? isGymExerciseLogged(milestone.exercise) : false)
    );
  };
  const homeTimelineSteps = homeTimelineMilestones.filter(
    (milestone) => milestone.kind !== "finish",
  );
  const homeTimelineDoneCount = homeTimelineSteps.filter(isHomeMilestoneDone).length;
  const homeTimelineDoneRatio =
    homeTimelineSteps.length > 0 ? homeTimelineDoneCount / homeTimelineSteps.length : 0;
  const homeMovesRemaining = homeTimelineMilestones.filter(
    (milestone) => milestone.kind === "workout" && !isHomeMilestoneDone(milestone),
  ).length;
  const homeMinutesLeft = Math.max(
    0,
    Math.ceil((homeTotalSeconds - homeElapsedSeconds) / 60),
  );
  const homeSessionWorkoutSteps = homeSessionCards.map((exercise, index) => {
    const replacement = replacedHomeExercises[exercise.exerciseId] ?? null;
    const startSeconds = homeWorkoutMilestoneSeconds[index] ?? homeWarmupSeconds;
    // A movement now ends exactly at its 5-minute slot — the passive rest
    // card that follows (when the shape has one) is its own timeline row.
    const endSeconds =
      index === homeWorkoutStepCount - 1
        ? homeTotalSeconds
        : Math.min(homeTotalSeconds, startSeconds + homeWorkoutStepSeconds);

    return {
      id: exercise.exerciseId,
      title: replacement?.title ?? exercise.title,
      eyebrow: replacement?.targetLabel ?? exercise.targetLabel,
      startSeconds,
      endSeconds,
      icon: exercise.icon,
      tintClass: exercise.shellClass,
      exercise,
      replacement,
    };
  });
  const homeSessionPlayerSteps = [
    // Sessions that skip the stretching block open straight on warm-up. When
    // it's present, stretching splits into a three-move sequence keyed by slot
    // ids `stretching-1`..`stretching-3` (spine → hips → legs). Same shape as
    // the warm-up sub-steps below; the timeline row above stays a single
    // "Stretching" milestone regardless.
    ...(homeStretchingSeconds > 0
      ? Array.from({ length: HOME_STRETCH_SEQUENCE_LENGTH }, (_, slot) => {
          const slotSeconds = homeStretchingSeconds / HOME_STRETCH_SEQUENCE_LENGTH;
          const startSeconds = slot * slotSeconds;
          const endSeconds =
            slot === HOME_STRETCH_SEQUENCE_LENGTH - 1
              ? homeStretchingSeconds
              : (slot + 1) * slotSeconds;

          return {
            id: `stretching-${slot + 1}`,
            title: "Stretching",
            eyebrow: `Move ${slot + 1} of ${HOME_STRETCH_SEQUENCE_LENGTH}`,
            startSeconds,
            endSeconds,
            icon: StretchIcon,
            tintClass: "from-[#E2F8F1] via-background to-[#FEF0E3]",
          };
        })
      : []),
    // Warm-up is a four-move sequence: the window is split into equal slots so
    // each of HOME_WARMUP_MOVES[focus] gets its own sub-step in the player. The
    // timeline still shows one "Warm-up" row (see homeTimelineMilestones);
    // sub-steps are a player concern only, so the guided hero rolls through
    // move 1 → 2 → 3 → 4 while the row above stays a single milestone.
    ...Array.from({ length: HOME_WARMUP_SEQUENCE_LENGTH }, (_, slot) => {
      const slotSeconds = warmupOnlySeconds / HOME_WARMUP_SEQUENCE_LENGTH;
      const startSeconds = homeStretchingSeconds + slot * slotSeconds;
      // Snap the last slot's end to homeWarmupSeconds so rounding never leaves
      // a gap between the final warm-up move and the first strength step.
      const endSeconds =
        slot === HOME_WARMUP_SEQUENCE_LENGTH - 1
          ? homeWarmupSeconds
          : homeStretchingSeconds + (slot + 1) * slotSeconds;

      return {
        id: `warmup-${slot + 1}`,
        title: "Warm-up",
        eyebrow: `Move ${slot + 1} of ${HOME_WARMUP_SEQUENCE_LENGTH}`,
        startSeconds,
        endSeconds,
        icon: Flame,
        tintClass: "from-[#FEF0E3] via-background to-[#E2F8F1]",
      };
    }),
    ...homeSessionWorkoutSteps,
  ];
  const activeHomeRestPeriod = homeSessionWorkoutSteps
    .slice(0, -1)
    .map((step, index) => ({
      id: `rest-${index + 1}`,
      startSeconds: step.endSeconds,
      endSeconds: homeSessionWorkoutSteps[index + 1]?.startSeconds ?? step.endSeconds,
      nextStep: homeSessionWorkoutSteps[index + 1],
      previousStep: step,
    }))
    .find(
      (rest) =>
        homeElapsedSeconds >= rest.startSeconds &&
        homeElapsedSeconds < rest.endSeconds,
    );
  const activeHomeSessionStep =
    homeSessionPlayerSteps.find(
      (step) =>
        homeElapsedSeconds >= step.startSeconds &&
        homeElapsedSeconds < step.endSeconds,
    ) ??
    activeHomeRestPeriod?.nextStep ??
    homeSessionPlayerSteps[homeSessionPlayerSteps.length - 1];
  // Taken from the step the guided player is on, so the row wearing NOW and
  // the screen you land on when you open the session are never two different
  // exercises. During a rest both point at the movement coming up.
  const activeHomeMilestoneId = (() => {
    if (isHomeWorkoutCompleted) {
      return "finish";
    }

    if (!isHomeWarmupComplete) {
      // Timeline row: while the elapsed time still falls inside the stretching
      // window the row above is "stretching", after that it's "warmup". Uses
      // the shape's own stretchingSeconds so 20/30-min sessions (which have
      // zero stretching) go straight to warm-up.
      return isHomeStretchComplete ? "warmup" : "stretching";
    }

    const activeExerciseId =
      activeHomeSessionStep && "exercise" in activeHomeSessionStep
        ? activeHomeSessionStep.exercise.exerciseId
        : null;

    return (
      homeTimelineMilestones.find(
        (milestone) =>
          "exercise" in milestone && milestone.exercise.exerciseId === activeExerciseId,
      )?.id ?? "finish"
    );
  })();
  const activeHomeSessionIndex = Math.max(
    0,
    homeSessionPlayerSteps.findIndex((step) => step.id === activeHomeSessionStep?.id),
  );
  const activeHomeWorkoutStepIndex = homeSessionWorkoutSteps.findIndex(
    (step) => step.id === activeHomeSessionStep?.id,
  );
  const nextHomeWorkoutStep =
    activeHomeWorkoutStepIndex >= 0
      ? homeSessionWorkoutSteps[activeHomeWorkoutStepIndex + 1]
      : undefined;
  const NextHomeWorkoutIcon = nextHomeWorkoutStep?.icon ?? Dumbbell;
  // The lead-in of every session that includes stretching runs a three-move
  // universal stretch sequence, then a four-move warm-up sequence keyed to the
  // day's focus. Sub-step ids are `stretching-1`..`stretching-3` and
  // `warmup-1`..`warmup-4`; the slot number picks the matching move from
  // HOME_STRETCH_MOVES / HOME_WARMUP_MOVES[focus]. Video URLs come through the
  // same map as strength clips, so a published R2 clip lights up automatically;
  // until then activeOpenerVideoSrc is undefined and SessionOpenerPlaceholder
  // renders in the hero (never the push-up FALLBACK_EXERCISE_VIDEO, which
  // would misrepresent what the user is meant to be doing).
  const stretchingSubStepMatch =
    activeHomeSessionStep?.id?.match(/^stretching-(\d+)$/) ?? null;
  const warmupSubStepMatch =
    activeHomeSessionStep?.id?.match(/^warmup-(\d+)$/) ?? null;
  const activeOpenerKind: "stretching" | "warmup" | null =
    stretchingSubStepMatch
      ? "stretching"
      : warmupSubStepMatch
        ? "warmup"
        : null;
  const activeStretchSlot = stretchingSubStepMatch
    ? Math.max(
        0,
        Math.min(HOME_STRETCH_SEQUENCE_LENGTH - 1, Number(stretchingSubStepMatch[1]) - 1),
      )
    : null;
  const activeWarmupSlot = warmupSubStepMatch
    ? Math.max(
        0,
        Math.min(HOME_WARMUP_SEQUENCE_LENGTH - 1, Number(warmupSubStepMatch[1]) - 1),
      )
    : null;
  const activeOpenerMove: SessionOpenerMove | null =
    activeOpenerKind === "stretching" && activeStretchSlot !== null
      ? HOME_STRETCH_MOVES[activeStretchSlot]
      : activeOpenerKind === "warmup" && activeWarmupSlot !== null
        ? HOME_WARMUP_MOVES[muscleFocus][activeWarmupSlot]
        : null;
  // By id first, then by name: the same move often appears on several days
  // ("Arm Circles", "Leg Swings"), so a clip filmed once covers all of them.
  const activeOpenerVideoSrc = activeOpenerMove
    ? findExerciseVideo(activeOpenerMove.exerciseId, activeOpenerMove.title)
    : undefined;
  const activeHomeSessionVideoSrc =
    activeHomeRestPeriod?.nextStep?.exercise?.sessionVideoSrc ??
    (activeHomeSessionStep && "exercise" in activeHomeSessionStep
      ? activeHomeSessionStep.exercise.sessionVideoSrc
      : undefined) ??
    activeOpenerVideoSrc ??
    (activeOpenerMove ? undefined : FALLBACK_EXERCISE_VIDEO);
  const homeRestSecondsLeft = activeHomeRestPeriod
    ? Math.max(0, activeHomeRestPeriod.endSeconds - homeElapsedSeconds)
    : 0;
  const isHomeRestGetReady =
    Boolean(activeHomeRestPeriod) && homeRestSecondsLeft <= HOME_REST_GET_READY_SECONDS;
  // Deliberately not falling back to the shared placeholder clip: previewing
  // push-ups under the caption "Up next: Barbell Back Squat" is worse than
  // showing no clip at all, and only 45 of the preset movements have one.
  const homeRestPreviewVideoSrc =
    activeHomeRestPeriod?.nextStep?.exercise?.sessionVideoSrc;
  // Not NextHomeWorkoutIcon: during a rest the active step is already the next
  // movement, so that one points a step further ahead than the preview shows.
  const HomeRestNextIcon = activeHomeRestPeriod?.nextStep?.icon ?? Dumbbell;
  const activeHomeSessionStart =
    activeHomeRestPeriod?.startSeconds ?? activeHomeSessionStep?.startSeconds ?? 0;
  const activeHomeSessionEnd =
    activeHomeRestPeriod?.endSeconds ??
    activeHomeSessionStep?.endSeconds ??
    homeTotalSeconds;
  const activeHomeSessionDuration = Math.max(
    1,
    activeHomeSessionEnd - activeHomeSessionStart,
  );
  const activeHomeSessionElapsed = Math.min(
    activeHomeSessionDuration,
    Math.max(0, homeElapsedSeconds - activeHomeSessionStart),
  );
  const activeHomeSessionRemaining = Math.max(
    0,
    activeHomeSessionDuration - activeHomeSessionElapsed,
  );
  const showHomeSessionIntro = homeSessionIntroPhase !== "session";
  const homeSessionIntroTitle = "Your workout session has started";
  const homeSessionRestMessages = [
    "Recovery is training too. Slow your breathing and get ready for the next strong set.",
    "Short rests help your muscles refill energy so your next movement stays clean.",
    "Use this pause to reset your posture, relax your jaw, and keep your focus sharp.",
    "Consistency beats intensity spikes. Take the rest, then come back smooth.",
    "A steady breath now makes the next exercise feel lighter.",
  ];
  const activeHomeRestMessage = activeHomeRestPeriod
    ? homeSessionRestMessages[
        Number(activeHomeRestPeriod.id.replace("rest-", "")) - 1
      ] ?? homeSessionRestMessages[0]
    : null;
  const activeHomeExercise =
    activeHomeSessionStep && "exercise" in activeHomeSessionStep
      ? activeHomeSessionStep.exercise
      : null;
  const activeHomeSetDrafts = activeHomeExercise ? getGymSetDrafts(activeHomeExercise) : [];
  const completedActiveHomeSetCount = activeHomeSetDrafts.filter(
    (setDraft) => setDraft.completed,
  ).length;
  const homeSetLoggerExercise =
    (homeSetLoggerExerciseId
      ? allWorkoutCards.find(
          (workoutCard) => workoutCard.exerciseId === homeSetLoggerExerciseId,
        )
      : undefined) ?? activeHomeExercise;
  const homeSetLoggerDrafts = homeSetLoggerExercise
    ? getGymSetDrafts(homeSetLoggerExercise)
    : [];
  const homeSetLoggerDraft =
    homeSetLoggerDrafts[homeSetLoggerSetIndex] ??
    homeSetLoggerDrafts[0] ?? {
      reps: 12,
      load: homeSetLoggerExercise ? getHomeDefaultLoad(homeSetLoggerExercise) : HOME_BASE_LOAD_VALUE,
      completed: false,
    };
  const homeSetLoggerPriorLog = homeSetLoggerExercise
    ? getPriorSessionSetLogs(homeSetLoggerExercise).find(
        (log) => log.setNumber === homeSetLoggerSetIndex + 1,
      )
    : undefined;
  const openHomeSetLoggerFor = (
    exercise: (typeof allWorkoutCards)[number] | null | undefined,
  ) => {
    if (!exercise) {
      return;
    }

    const firstIncompleteIndex = getGymSetDrafts(exercise).findIndex(
      (setDraft) => !setDraft.completed,
    );
    setHomeSetLoggerExerciseId(exercise.exerciseId);
    setHomeSetLoggerSetIndex(firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex);
    setHomeSetLoggerOpen(true);
  };
  const openHomeSetLogger = () => {
    openHomeSetLoggerFor(activeHomeExercise);
  };
  const weightPickerOptions =
    gymWeightPicker?.source === "home"
      ? HOME_LOAD_OPTIONS
      : GYM_WEIGHT_OPTIONS;
  // Opens the check-in and stops the caller. An optional resume callback
  // fires when the user dismisses the sheet (Skip / Submit / Pick minutes)
  // so the original tap that opened the sheet carries through instead of
  // needing to be repeated.
  const requestReadinessBeforeWorkout = (onResume?: () => void) => {
    // Adaptive Session (length picker + readiness sliders) is Pro-only, so a
    // Starter tapping Play just starts the default home session. The upsell
    // lives on the "Unlock adaptive sessions" tile above instead of blocking
    // the workout behind a paywall.
    if (
      selectedWorkoutEnvironment !== "home" ||
      !requiresReadinessBeforeStart ||
      !isPro
    ) {
      return false;
    }

    window.dispatchEvent(
      new CustomEvent("dietfit-open-readiness-check-in", {
        detail: onResume ? { onResume } : undefined,
      }),
    );
    return true;
  };
  const startOrResumeHomeSessionNow = () => {
    if (isHomeSessionComplete) {
      return;
    }

    const now = Date.now();
    setHomeTimerNow(now);
    setHomeTimerStartedAt(now);
  };
  const handleStartOrResumeHomeSession = () => {
    if (requestReadinessBeforeWorkout(startOrResumeHomeSessionNow)) {
      return;
    }

    startOrResumeHomeSessionNow();
  };
  const handleOpenHomeSessionScreen = () => {
    const openAndStart = () => {
      setShowHomeSessionScreen(true);
      startOrResumeHomeSessionNow();
    };

    if (requestReadinessBeforeWorkout(openAndStart)) {
      return;
    }

    openAndStart();
  };
  const handlePauseHomeSession = () => {
    if (homeTimerStartedAt === null) {
      return;
    }

    setHomeTimerBaseSeconds(homeElapsedSeconds);
    setHomeTimerStartedAt(null);
  };
  // Moves the clock to the end of the stretching block so the timeline, ring
  // and guided player all agree that warm-up is next. A running timer keeps
  // running from the new point.
  const handleMarkStretchDone = () => {
    const nextSeconds = Math.max(homeElapsedSeconds, homeStretchingSeconds);
    setHomeTimerBaseSeconds(nextSeconds);
    setHomeTimerStartedAt(homeTimerStartedAt === null ? null : Date.now());
    setHomeTimerNow(Date.now());
    setHomeStretchMarkedDone(true);
  };
  const handleMarkWarmupDone = () => {
    setHomeTimerBaseSeconds(Math.max(homeElapsedSeconds, homeWarmupSeconds));
    setHomeTimerStartedAt(null);
    setHomeTimerNow(Date.now());
    setHomeWarmupMarkedDone(true);
  };
  const toggleHomeMilestone = (milestoneId: string) => {
    setExpandedHomeMilestones((current) =>
      current.includes(milestoneId)
        ? current.filter((id) => id !== milestoneId)
        : [...current, milestoneId],
    );
  };
  const applyMuscleFocusChange = (nextFocus: MuscleFocus) => {
    setSelectedMuscleFocusByDate((current) => ({
      ...current,
      [selectedDate]: nextFocus,
    }));
    // Switching to a muscle group leaves any active custom routine for the day.
    setSelectedCustomRoutineByDate((current) => {
      if (!current[selectedDate]) {
        return current;
      }
      const next = { ...current };
      delete next[selectedDate];
      return next;
    });
    setDraftGymRoutinesByDate((current) => {
      if (!current[selectedDate]) {
        return current;
      }

      return Object.fromEntries(
        Object.entries(current).filter(([date]) => date !== selectedDate),
      );
    });
    setShowGymWorkoutPicker(false);
    setExpandedGymExerciseId(null);
    setOpenGymMenuExerciseId(null);
  };

  const handleSelectMuscleFocus = (nextFocus: MuscleFocus) => {
    if (isPastSelectedDate || nextFocus === muscleFocus) {
      return;
    }

    const hasGymSetsToday = state.workoutLoadLogs.some((log) => log.sessionDate === selectedDate);
    const needsWarning =
      (selectedWorkoutEnvironment === "home" && isHomeTimerRunning) ||
      (selectedWorkoutEnvironment === "gym" && hasGymSetsToday);

    if (needsWarning) {
      setPendingFocusChange(nextFocus);
      setShowFocusChangeWarning(true);
      return;
    }

    applyMuscleFocusChange(nextFocus);
  };
  const handleAddGymWorkout = (exercise: WorkoutPreset) => {
    const nextRoutine = [...baseFocusExercises, exercise];

    if (activeCustomRoutine) {
      // Adding to an active custom routine updates the saved routine in place.
      setSavedCustomRoutines((current) =>
        current.map((routine) =>
          routine.id === activeCustomRoutine.id
            ? { ...routine, exercises: nextRoutine }
            : routine,
        ),
      );
    } else if (savedGymRoutineForFocus) {
      setSavedGymRoutinesByFocus((current) => ({
        ...current,
        [muscleFocus]: nextRoutine,
      }));
    } else {
      setDraftGymRoutinesByDate((current) => ({
        ...current,
        [selectedDate]: nextRoutine,
      }));
    }
  };
  const handleAddCustomGymWorkout = () => {
    const trimmedName = customGymWorkoutName.trim();
    const trimmedReps = customGymWorkoutReps.trim();

    if (!trimmedName) {
      return;
    }

    const normalizedName = trimmedName.toLowerCase();

    if (baseFocusExercises.some((exercise) => exercise.title.toLowerCase() === normalizedName)) {
      setCustomGymWorkoutName("");
      setCustomGymWorkoutReps("");
      return;
    }

    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const customWorkout = {
      exerciseId: `custom-${selectedDate}-${slug || "workout"}`,
      title: trimmedName,
      type: "strength",
      reps: trimmedReps || "3 x 12",
      target: muscleFocusLabel,
      equipment: "Custom",
      guidance: "Personal workout added to your gym routine.",
    };

    setCustomGymWorkoutsByDate((current) => {
      const existingForDate = current[selectedDate] ?? [];

      if (existingForDate.some((exercise) => exercise.exerciseId === customWorkout.exerciseId)) {
        return current;
      }

      return {
        ...current,
        [selectedDate]: [...existingForDate, customWorkout],
      };
    });
    handleAddGymWorkout(customWorkout);
    setCustomGymWorkoutName("");
    setCustomGymWorkoutReps("");
  };
  const fetchCustomizeLibrary = async () => {
    if (customizeLibraryFetched || customizeLibraryLoading) {
      return;
    }

    setCustomizeLibraryLoading(true);
    setCustomizeLibraryError(null);

    try {
      const response = await fetch("/api/workout-library");

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as { items?: WorkoutLibraryItem[] };

      setCustomizeLibraryItems(Array.isArray(data.items) ? data.items : []);
      setCustomizeLibraryFetched(true);
    } catch (error) {
      console.error("Failed to load workout library.", error);
      setCustomizeLibraryError("Couldn't load exercises. Tap retry to try again.");
    } finally {
      setCustomizeLibraryLoading(false);
    }
  };
  // Opening the library from muscle coverage adds a single finisher to today
  // rather than building a routine, so the add path is a different one.
  const handleOpenFinisherLibrary = (entry: MuscleCoverageEntry) => {
    setFinisherMuscleLabel(entry.label);
    setCustomizeLibrarySearch(entry.label);
    setShowCustomizeLibrary(true);
    void fetchCustomizeLibrary();
  };
  const handleAddFinisherWorkout = (item: WorkoutLibraryItem) => {
    const { muscle: _muscle, ...preset } = item;
    void _muscle;

    setCustomGymWorkoutsByDate((current) => {
      const existing = current[selectedDate] ?? [];

      if (existing.some((exercise) => exercise.exerciseId === preset.exerciseId)) {
        return current;
      }

      return { ...current, [selectedDate]: [...existing, preset] };
    });
    setFinisherMuscleLabel(null);
    setShowCustomizeLibrary(false);
  };
  const handleOpenCustomizeLibrary = () => {
    setCustomizeLibrarySearch("");
    setShowCustomizeLibrary(true);
    void fetchCustomizeLibrary();
  };
  const handleAddCustomizeWorkout = (item: WorkoutLibraryItem) => {
    const { muscle: _muscle, ...preset } = item;
    void _muscle;

    setDraftGymRoutinesByDate((current) => {
      const existing = current[selectedDate] ?? [];
      const normalizedTitle = preset.title.toLowerCase();

      if (
        existing.some(
          (exercise) =>
            exercise.exerciseId === preset.exerciseId ||
            exercise.title.toLowerCase() === normalizedTitle,
        )
      ) {
        return current;
      }

      return {
        ...current,
        [selectedDate]: [...existing, preset],
      };
    });
  };
  const handleRemoveCustomizeWorkout = (exerciseId: string) => {
    setDraftGymRoutinesByDate((current) => {
      const existing = current[selectedDate] ?? [];

      return {
        ...current,
        [selectedDate]: existing.filter((exercise) => exercise.exerciseId !== exerciseId),
      };
    });
  };
  // Confirm handler for the name prompt — routes by mode. "create" just names the
  // routine and opens the builder; "start" renames + saves + starts in one step.
  const handleConfirmCustomizeName = () => {
    const name = customizeNameDraft.trim() || "My Routine";

    setCustomizeRoutineNameByDate((current) => ({ ...current, [selectedDate]: name }));
    setShowCustomizeNamePrompt(false);

    if (customizeNamePromptMode === "start") {
      handleStartCustomRoutine(name);
    } else {
      setFocusModeByDate((current) => ({ ...current, [selectedDate]: "customize" }));
    }
  };
  // Save the built routine as a named custom routine (creating a new one, or
  // updating the one being edited), select it for the day, then drop into the
  // normal set-logger view.
  const handleStartCustomRoutine = (routineName?: string) => {
    const name = routineName ?? customizeRoutineNameByDate[selectedDate] ?? "My Routine";
    const exercises = (draftGymRoutinesByDate[selectedDate] ?? []).map((exercise) => ({
      exerciseId: exercise.exerciseId,
      title: exercise.title,
      type: exercise.type,
      reps: exercise.reps,
      target: exercise.target,
      equipment: exercise.equipment,
      guidance: exercise.guidance,
    }));
    const routineId =
      editingCustomRoutineId ??
      `routine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    setSavedCustomRoutines((current) => {
      const existingIndex = current.findIndex((routine) => routine.id === routineId);
      const nextRoutine: SavedCustomRoutine = { id: routineId, name, exercises };
      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = nextRoutine;
        return next;
      }
      return [...current, nextRoutine];
    });
    setSelectedCustomRoutineByDate((current) => ({ ...current, [selectedDate]: routineId }));
    setDraftGymRoutinesByDate((current) => {
      const next = { ...current };
      delete next[selectedDate];
      return next;
    });
    setEditingCustomRoutineId(null);
    setFocusModeByDate((current) => ({ ...current, [selectedDate]: "normal" }));
  };
  // Open the name prompt to rename + save + start the built routine.
  const handleOpenStartRoutinePrompt = () => {
    setCustomizeNameDraft(customizeRoutineNameByDate[selectedDate] ?? "");
    setCustomizeNamePromptMode("start");
    setShowCustomizeNamePrompt(true);
  };
  // Start building a brand-new custom routine (fresh draft).
  const handleCreateCustomRoutine = () => {
    setEditingCustomRoutineId(null);
    setDraftGymRoutinesByDate((current) => ({ ...current, [selectedDate]: [] }));
    setCustomizeNameDraft("");
    setCustomizeNamePromptMode("create");
    setShowCustomizeNamePrompt(true);
    // Warm the exercise library so it's ready before "Add exercises" is tapped.
    void fetchCustomizeLibrary();
  };
  // Select a saved custom routine for the day (loads it into the set logger).
  const handleSelectCustomRoutine = (routineId: string) => {
    setSelectedCustomRoutineByDate((current) => ({ ...current, [selectedDate]: routineId }));
    setFocusModeByDate((current) => ({ ...current, [selectedDate]: "normal" }));
  };
  // Re-open the builder to edit an already-saved custom routine.
  const handleEditCustomRoutine = (routineId: string) => {
    const routine = savedCustomRoutines.find((item) => item.id === routineId);
    if (!routine) {
      return;
    }
    setEditingCustomRoutineId(routineId);
    setDraftGymRoutinesByDate((current) => ({
      ...current,
      [selectedDate]: routine.exercises as WorkoutPreset[],
    }));
    setCustomizeRoutineNameByDate((current) => ({ ...current, [selectedDate]: routine.name }));
    setFocusModeByDate((current) => ({ ...current, [selectedDate]: "customize" }));
    // Warm the exercise library so it's ready before "Add exercises" is tapped.
    void fetchCustomizeLibrary();
  };
  const handleRemoveGymWorkout = (exerciseId: string) => {
    if (selectedWorkoutEnvironment !== "gym") {
      return;
    }

    const nextRoutine = baseFocusExercises.filter((exercise) => exercise.exerciseId !== exerciseId);

    if (activeCustomRoutine) {
      // Removing from an active custom routine updates the saved routine in place.
      setSavedCustomRoutines((current) =>
        current.map((routine) =>
          routine.id === activeCustomRoutine.id
            ? { ...routine, exercises: nextRoutine }
            : routine,
        ),
      );
    } else if (savedGymRoutineForFocus) {
      setSavedGymRoutinesByFocus((current) => ({
        ...current,
        [muscleFocus]: nextRoutine,
      }));
    } else {
      setDraftGymRoutinesByDate((current) => ({
        ...current,
        [selectedDate]: nextRoutine,
      }));
    }

    setCustomGymWorkoutsByDate((current) => {
      const existingForDate = current[selectedDate] ?? [];

      if (!existingForDate.some((exercise) => exercise.exerciseId === exerciseId)) {
        return current;
      }

      const nextCustom = existingForDate.filter((exercise) => exercise.exerciseId !== exerciseId);

      if (nextCustom.length === existingForDate.length) {
        return current;
      }

      if (nextCustom.length === 0) {
        const nextState = { ...current };
        delete nextState[selectedDate];
        return nextState;
      }

      return {
        ...current,
        [selectedDate]: nextCustom,
      };
    });
    setExpandedGymExerciseId((current) => (current === exerciseId ? null : current));
    setOpenGymMenuExerciseId(null);
    setGymMenuAnchor(null);
  };
  const handleToggleGymCard = (exercise: (typeof allWorkoutCards)[number]) => {
    if (requestReadinessBeforeWorkout()) {
      return;
    }

    const draftKey = getGymSetDraftKey(exercise.sessionDate, exercise.exerciseId);

    setOpenGymMenuExerciseId(null);
    setGymSetDraftsByExercise((current) => ({
      ...current,
      [draftKey]: current[draftKey] ?? getInitialGymSetDrafts(exercise),
    }));
    setExpandedGymExerciseId((current) =>
      current === exercise.exerciseId ? null : exercise.exerciseId,
    );
  };
  // The hero's play button: open the first exercise not yet logged and bring
  // it into view, so the set logger is one tap from the top of the screen.
  const nextGymExercise = allWorkoutCards.find((exercise) => !isGymExerciseLogged(exercise));
  const handleOpenNextGymExercise = () => {
    if (!nextGymExercise) {
      return;
    }
    if (expandedGymExerciseId !== nextGymExercise.exerciseId) {
      handleToggleGymCard(nextGymExercise);
    }
    window.setTimeout(() => {
      document
        .getElementById(`gym-exercise-${nextGymExercise.exerciseId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  };
  const handleAddGymSet = (exercise: (typeof allWorkoutCards)[number]) => {
    if (selectedWorkoutEnvironment === "gym" && requestReadinessBeforeWorkout()) {
      return;
    }

    const draftKey = getGymSetDraftKey(exercise.sessionDate, exercise.exerciseId);
    const currentDrafts = getGymSetDrafts(exercise);
    const previousDraft =
      currentDrafts.at(-1) ?? {
        reps: 12,
        load: selectedWorkoutEnvironment === "home" ? getHomeDefaultLoad(exercise) : getBaseGymLoadValue(),
        completed: false,
      };

    setGymSetDraftsByExercise((current) => ({
      ...current,
      [draftKey]: [
        ...currentDrafts,
        {
          reps: previousDraft.reps,
          load: previousDraft.load,
          completed: false,
          touched: previousDraft.touched ?? false,
        },
      ],
    }));
  };
  const getNextSetDrafts = (
    exercise: (typeof allWorkoutCards)[number],
    setIndex: number,
    updateSet: (setDraft: GymSetDraft) => GymSetDraft,
  ) => {
    const currentDrafts = getGymSetDrafts(exercise);
    const fallbackDraft =
      currentDrafts.at(-1) ?? {
        reps: 12,
        load: selectedWorkoutEnvironment === "home" ? getHomeDefaultLoad(exercise) : getBaseGymLoadValue(),
        completed: false,
      };
    const nextDrafts = Array.from(
      { length: Math.max(currentDrafts.length, setIndex + 1) },
      (_, index) =>
        currentDrafts[index] ?? {
          reps: fallbackDraft.reps,
          load: fallbackDraft.load,
          completed: false,
        },
    );

    nextDrafts[setIndex] = updateSet(nextDrafts[setIndex]);
    return nextDrafts;
  };
  const markHomeSetDone = (
    exercise: (typeof allWorkoutCards)[number],
    setIndex: number,
  ) => {
    const draftKey = getGymSetDraftKey(exercise.sessionDate, exercise.exerciseId);
    const nextDrafts = getNextSetDrafts(exercise, setIndex, (setDraft) => ({
      ...setDraft,
      completed: true,
    }));
    const nextSet = nextDrafts[setIndex];

    setGymSetDraftsByExercise((current) => ({
      ...current,
      [draftKey]: nextDrafts,
    }));
    setCompletedGymSetKeys((current) => ({
      ...current,
      [getGymSetCompletionKey(exercise.sessionDate, exercise.exerciseId, setIndex + 1)]: true,
    }));

    if (!isGymExerciseLogged(exercise)) {
      toggleExercise(exercise.sessionId, exercise.exerciseId, exercise.sessionDate);
    }

    syncGymSetToHistory(exercise, setIndex + 1, nextSet);
    const nextSetIndex = Math.min(setIndex, nextDrafts.length - 1);
    setHomeSetLoggerSetIndex(nextSetIndex);
    setHomeTimelineSetIndexByExercise((current) => ({
      ...current,
      [exercise.exerciseId]: nextSetIndex,
    }));
  };
  const applyVoiceGymSet = (
    exercise: (typeof allWorkoutCards)[number],
    transcript: string,
  ) => {
    const parsed = parseVoiceGymSet(transcript);

    if (!parsed.reps && parsed.load === null) {
      setVoiceGymSetError("Say reps and weight, like 40 kg 10 reps.");
      return;
    }

    const draftKey = getGymSetDraftKey(exercise.sessionDate, exercise.exerciseId);
    const currentDrafts = getGymSetDrafts(exercise);
    const spokenSetIndex =
      parsed.setNumber !== null && parsed.setNumber > 0 ? parsed.setNumber - 1 : null;
    const firstIncompleteIndex = currentDrafts.findIndex((setDraft) => !setDraft.completed);
    const setIndex =
      spokenSetIndex ??
      (firstIncompleteIndex === -1 ? currentDrafts.length : firstIncompleteIndex);
    const fallbackDraft =
      currentDrafts.at(-1) ?? {
        reps: 12,
        load: selectedWorkoutEnvironment === "home" ? getHomeDefaultLoad(exercise) : getBaseGymLoadValue(),
        completed: false,
      };
    const nextDrafts = Array.from(
      { length: Math.max(currentDrafts.length, setIndex + 1) },
      (_, index) =>
        currentDrafts[index] ?? {
          reps: fallbackDraft.reps,
          load: fallbackDraft.load,
          completed: false,
        },
    );
    const nextSet = {
      ...nextDrafts[setIndex],
      reps: parsed.reps ?? nextDrafts[setIndex].reps,
      load: parsed.load ?? nextDrafts[setIndex].load,
      completed: true,
      touched: true,
    };

    nextDrafts[setIndex] = nextSet;
    setGymSetDraftsByExercise((current) => ({
      ...current,
      [draftKey]: nextDrafts,
    }));
    setCompletedGymSetKeys((current) => ({
      ...current,
      [getGymSetCompletionKey(exercise.sessionDate, exercise.exerciseId, setIndex + 1)]: true,
    }));

    if (!isGymExerciseLogged(exercise)) {
      toggleExercise(exercise.sessionId, exercise.exerciseId, exercise.sessionDate);
    }

    syncGymSetToHistory(exercise, setIndex + 1, nextSet);
    setHomeTimelineSetIndexByExercise((current) => ({
      ...current,
      [exercise.exerciseId]: setIndex,
    }));
    setVoiceGymSetError(null);
  };
  const handleVoiceGymSet = async (exercise: (typeof allWorkoutCards)[number]) => {
    if (!isPro) {
      setVoiceGymSetError("Voice set logging is available in Pro.");
      return;
    }

    if (requestReadinessBeforeWorkout()) {
      return;
    }

    const Api = window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!Api) {
      setVoiceGymSetError("Voice logging is not supported in this browser.");
      return;
    }

    if (voiceGymSetExerciseId === exercise.exerciseId) {
      gymVoiceRecognitionRef.current?.stop();
      return;
    }

    // In the app the OS has to grant the mic first, or the WebView refuses
    // silently. This is what shows the system mic prompt.
    const permission = await ensureMicPermission();
    if (permission === "blocked") {
      setVoiceGymSetError(micBlockedMessage());
      return;
    }
    if (permission === "dismissed") {
      setVoiceGymSetError(null);
      return;
    }

    gymVoiceRecognitionRef.current?.stop();
    const recognition = new Api();
    gymVoiceTranscriptRef.current = "";
    setVoiceGymSetTranscript("");
    setVoiceGymSetError(null);
    setVoiceGymSetExerciseId(exercise.exerciseId);
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      const trimmedTranscript = transcript.trim();
      if (trimmedTranscript) {
        gymVoiceTranscriptRef.current = trimmedTranscript;
        setVoiceGymSetTranscript(trimmedTranscript);
      }
    };
    recognition.onerror = (event) => {
      // A blocked mic is not a misheard set -- pointing at phrasing sends the user
      // looking for the wrong fix.
      setVoiceGymSetError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? micBlockedMessage()
          : "I couldn't catch that. Try 40 kg 10 reps.",
      );
      setVoiceGymSetExerciseId(null);
    };
    recognition.onend = () => {
      const transcript = gymVoiceTranscriptRef.current.trim();
      setVoiceGymSetExerciseId(null);

      if (transcript) {
        applyVoiceGymSet(exercise, transcript);
      }
    };
    gymVoiceRecognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setVoiceGymSetExerciseId(null);
      setVoiceGymSetError("Voice logging couldn't start.");
    }
  };
  const handleDeleteGymSet = (
    exercise: (typeof allWorkoutCards)[number],
    setIndex: number,
  ) => {
    const draftKey = getGymSetDraftKey(exercise.sessionDate, exercise.exerciseId);
    const currentDrafts = getGymSetDrafts(exercise);

    if (!currentDrafts[setIndex]) {
      return;
    }

    const nextDrafts = currentDrafts.filter((_, index) => index !== setIndex);
    const isMarkedCompleted = state.workoutLogs.some(
      (log) =>
        log.sessionDate === exercise.sessionDate &&
        (!exercise.sessionId || log.sessionId === exercise.sessionId) &&
        log.exercisesCompleted.includes(exercise.exerciseId),
    );
    const hasRemainingLoggedSets = state.workoutLoadLogs.some(
      (log) =>
        log.sessionDate === exercise.sessionDate &&
        log.exerciseId === exercise.exerciseId &&
        (!exercise.sessionId || !log.sessionId || log.sessionId === exercise.sessionId) &&
        log.setNumber !== setIndex + 1,
    );

    setGymSetDraftsByExercise((current) => ({
      ...current,
      [draftKey]: nextDrafts,
    }));
    setCompletedGymSetKeys((current) => {
      const next = { ...current };

      for (let setNumber = 1; setNumber <= currentDrafts.length; setNumber += 1) {
        delete next[
          getGymSetCompletionKey(exercise.sessionDate, exercise.exerciseId, setNumber)
        ];
      }

      nextDrafts.forEach((setDraft, index) => {
        if (setDraft.completed) {
          next[
            getGymSetCompletionKey(exercise.sessionDate, exercise.exerciseId, index + 1)
          ] = true;
        }
      });

      return next;
    });
    removeWorkoutLoadLog({
      sessionDate: exercise.sessionDate,
      sessionId: exercise.sessionId,
      exerciseId: exercise.exerciseId,
      setNumber: setIndex + 1,
    });

    if (
      isMarkedCompleted &&
      !hasRemainingLoggedSets &&
      !nextDrafts.some((setDraft) => setDraft.completed)
    ) {
      toggleExercise(exercise.sessionId, exercise.exerciseId, exercise.sessionDate);
    }
  };
  const handleSaveGymWeight = () => {
    if (!gymWeightPicker) {
      return;
    }

    const exercise = allWorkoutCards.find(
      (workoutCard) => workoutCard.exerciseId === gymWeightPicker.exerciseId,
    );

    if (!exercise) {
      setGymWeightPicker(null);
      return;
    }

    const draftKey = getGymSetDraftKey(exercise.sessionDate, exercise.exerciseId);

    const savedLoad = gymWeightPicker.value;

    setGymSetDraftsByExercise((current) => ({
      ...current,
      [draftKey]: getGymSetDrafts(exercise).map((setDraft, index) =>
        index === gymWeightPicker.setIndex
          ? {
              ...setDraft,
              load: savedLoad,
              touched: true,
            }
          : setDraft,
      ),
    }));
    const nextDraft = getGymSetDrafts(exercise)[gymWeightPicker.setIndex];

    if (nextDraft) {
      syncGymSetToHistory(exercise, gymWeightPicker.setIndex + 1, {
        ...nextDraft,
        load: savedLoad,
      });
    }
    setGymWeightPicker(null);
  };
  const handleSaveGymReps = () => {
    if (!gymRepsPicker) {
      return;
    }

    const exercise = allWorkoutCards.find(
      (workoutCard) => workoutCard.exerciseId === gymRepsPicker.exerciseId,
    );

    if (!exercise) {
      setGymRepsPicker(null);
      return;
    }

    const draftKey = getGymSetDraftKey(exercise.sessionDate, exercise.exerciseId);

    setGymSetDraftsByExercise((current) => ({
      ...current,
      [draftKey]: getGymSetDrafts(exercise).map((setDraft, index) =>
        index === gymRepsPicker.setIndex
          ? {
              ...setDraft,
              reps: gymRepsPicker.value,
              touched: true,
            }
          : setDraft,
      ),
    }));
    const nextDraft = getGymSetDrafts(exercise)[gymRepsPicker.setIndex];

    if (nextDraft) {
      syncGymSetToHistory(exercise, gymRepsPicker.setIndex + 1, {
        ...nextDraft,
        reps: gymRepsPicker.value,
      });
    }
    setGymRepsPicker(null);
  };
  const handleSaveGymRoutine = () => {
    setSavedGymRoutinesByFocus((current) => ({
      ...current,
      [muscleFocus]: baseFocusExercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        title: exercise.title,
        type: exercise.type,
        reps: exercise.reps,
        target: exercise.target,
        equipment: exercise.equipment,
        guidance: exercise.guidance,
      })),
    }));
    setDraftGymRoutinesByDate((current) => {
      const nextState = { ...current };
      delete nextState[selectedDate];
      return nextState;
    });
  };
  const environmentTheme =
    selectedWorkoutEnvironment === "home"
      ? {
          // Flat Korean-reskin ground — no decorative top wash or orb.
          viewportOverlay: "",
          topFade: "",
          topOrb: "bg-transparent",
          toggleSelected:
            "bg-primary text-white shadow-[0_10px_22px_rgba(49,95,86,0.2)]",
          selectedDate:
            "border-primary bg-primary text-white shadow-[0_12px_22px_rgba(49,95,86,0.2)]",
          primaryButton:
            "bg-primary text-white shadow-[0_14px_28px_rgba(49,95,86,0.2)] hover:bg-primary-strong",
        }
      : {
          viewportOverlay: "",
          topFade: "",
          topOrb: "bg-transparent",
          toggleSelected:
            "bg-primary-strong text-white shadow-[0_10px_22px_rgba(17,23,15,0.18)]",
          selectedDate:
            "border-foreground bg-primary-strong text-white shadow-[0_12px_22px_rgba(17,23,15,0.18)]",
          primaryButton:
            "bg-primary-strong text-white shadow-[0_14px_28px_rgba(17,23,15,0.18)] hover:bg-black",
        };

  // Rendered by both the gym screen and the home session player, which are
  // separate returns — the pickers have to be mounted in each.
  const renderSetValuePickers = () => (
    <>
      {gymWeightPicker ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="glass-sheet glass-ui w-full max-w-[380px] rounded-hero p-5 text-foreground">
            <h3 className="text-[19px] font-medium tracking-[-0.02em]">
              Weight (kg)
            </h3>
            <p className="mt-1 text-[12.5px] text-foreground/58">Select a weight</p>
            <div>
              <div className="relative mx-auto mt-3 h-[168px] max-w-[300px] overflow-hidden">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-[linear-gradient(180deg,#faf8f3,rgba(250,248,243,0))]" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-[linear-gradient(0deg,#faf8f3,rgba(250,248,243,0))]" />
                <div className="pointer-events-none absolute inset-x-4 top-1/2 h-10 -translate-y-1/2 rounded-[12px] bg-primary-strong/8" />
                <div
                  ref={gymWeightPickerListRef}
                  onScroll={(event) => {
                    const nextIndex = Math.max(
                      0,
                      Math.min(
                        weightPickerOptions.length - 1,
                        Math.round(
                          event.currentTarget.scrollTop / GYM_WEIGHT_ROW_HEIGHT,
                        ),
                      ),
                    );
                    const nextValue = weightPickerOptions[nextIndex];

                    setGymWeightPicker((current) =>
                      current && current.value !== nextValue
                        ? {
                            ...current,
                            value: nextValue,
                          }
                        : current,
                    );
                  }}
                  className="relative z-[1] h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{ scrollSnapType: "y mandatory" }}
                >
                  <div style={{ height: GYM_WEIGHT_PICKER_SPACER }} />
                  {weightPickerOptions.map((weightOption) => {
                    const isSelected = weightOption === gymWeightPicker.value;

                    return (
                      <button
                        key={weightOption}
                        type="button"
                        onClick={() =>
                          setGymWeightPicker((current) =>
                            current
                              ? {
                                  ...current,
                                  value: weightOption,
                                }
                              : current,
                          )
                        }
                        className={cn(
                          "flex h-10 w-full items-center justify-center text-center text-[20px] font-medium tabular-nums transition",
                          isSelected ? "text-foreground" : "text-foreground/24 hover:text-foreground/52",
                        )}
                        style={{ scrollSnapAlign: "center" }}
                      >
                        {formatLoadValue(weightOption)} kg
                      </button>
                    );
                  })}
                  <div style={{ height: GYM_WEIGHT_PICKER_SPACER }} />
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setGymWeightPicker(null)}
                className="flex h-11 items-center justify-center rounded-full border border-foreground/12 bg-white text-[13.5px] font-semibold text-foreground/70 transition active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGymWeight}
                className="flex h-11 items-center justify-center rounded-full bg-primary-strong text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(12,39,35,0.22)] transition active:scale-[0.97]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {gymRepsPicker ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-5 pt-10 backdrop-blur-sm">
          <div className="glass-sheet glass-ui w-full max-w-[360px] rounded-hero p-5 text-foreground">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-foreground/55">
                  Reps
                </p>
                <h3 className="mt-1 text-[19px] font-medium tracking-[-0.02em]">
                  Set {gymRepsPicker.setIndex + 1}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGymRepsPicker(null)}
                className="glass-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/58 transition active:scale-[0.95]"
                aria-label="Close reps picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <p className="mt-3 text-[12.5px] text-foreground/58">Select reps</p>
              <div className="relative mx-auto mt-3 h-[168px] max-w-[300px] overflow-hidden">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-[linear-gradient(180deg,#faf8f3,rgba(250,248,243,0))]" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-[linear-gradient(0deg,#faf8f3,rgba(250,248,243,0))]" />
                <div className="pointer-events-none absolute inset-x-4 top-1/2 h-10 -translate-y-1/2 rounded-[12px] bg-primary-strong/8" />
                <div
                  ref={gymRepsPickerListRef}
                  onScroll={(event) => {
                    const nextIndex = Math.max(
                      0,
                      Math.min(
                        GYM_REPS_OPTIONS.length - 1,
                        Math.round(
                          event.currentTarget.scrollTop / GYM_WEIGHT_ROW_HEIGHT,
                        ),
                      ),
                    );
                    const nextValue = GYM_REPS_OPTIONS[nextIndex];

                    setGymRepsPicker((current) =>
                      current && current.value !== nextValue
                        ? {
                            ...current,
                            value: nextValue,
                          }
                        : current,
                    );
                  }}
                  className="relative z-[1] h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{ scrollSnapType: "y mandatory" }}
                >
                  <div style={{ height: GYM_WEIGHT_PICKER_SPACER }} />
                  {GYM_REPS_OPTIONS.map((repsOption) => {
                    const isSelected = repsOption === gymRepsPicker.value;

                    return (
                      <button
                        key={repsOption}
                        type="button"
                        onClick={() =>
                          setGymRepsPicker((current) =>
                            current
                              ? {
                                  ...current,
                                  value: repsOption,
                                }
                              : current,
                          )
                        }
                        className={cn(
                          "flex h-10 w-full items-center justify-center text-center text-[20px] font-medium tabular-nums transition",
                          isSelected ? "text-foreground" : "text-foreground/24 hover:text-foreground/52",
                        )}
                        style={{ scrollSnapAlign: "center" }}
                      >
                        {repsOption} reps
                      </button>
                    );
                  })}
                  <div style={{ height: GYM_WEIGHT_PICKER_SPACER }} />
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setGymRepsPicker(null)}
                className="flex h-11 items-center justify-center rounded-full border border-foreground/12 bg-white text-[13.5px] font-semibold text-foreground/70 transition active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGymReps}
                className="flex h-11 items-center justify-center rounded-full bg-primary-strong text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(12,39,35,0.22)] transition active:scale-[0.97]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  if (showHomeSessionScreen && selectedWorkoutEnvironment === "home") {
    return (
      <div className="glass-ui fixed inset-0 z-50 bg-background">
        <GlassBackdrop />
        <section className="relative mx-auto flex h-full w-full max-w-[520px] flex-col overflow-hidden">
          <div className="px-4 pt-2">
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${homeSessionPlayerSteps.length}, minmax(0, 1fr))`,
              }}
              aria-label="Session mini-session progress"
            >
              {homeSessionPlayerSteps.map((step) => {
                const stepDuration = Math.max(1, step.endSeconds - step.startSeconds);
                const stepElapsed = Math.min(
                  stepDuration,
                  Math.max(0, homeElapsedSeconds - step.startSeconds),
                );
                const stepProgress = stepElapsed / stepDuration;
                const isActiveStep = activeHomeSessionStep?.id === step.id;

                return (
                  <div
                    key={step.id}
                    className={cn(
                      "h-1 overflow-hidden rounded-full bg-primary/12",
                      isActiveStep && "bg-primary/18",
                    )}
                    title={step.title}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full bg-primary transition-[width] duration-700",
                        isActiveStep && "bg-primary-strong",
                      )}
                      style={{ width: `${Math.round(stepProgress * 100)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowHomeSessionScreen(false)}
                className="glass flex h-10 w-10 items-center justify-center rounded-full text-primary-strong transition active:scale-[0.96]"
                aria-label="Close session screen"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
              <div className="glass rounded-full px-4 py-2 text-[20px] font-medium leading-none tracking-[-0.02em] tabular-nums text-primary-strong">
                {formatTimerLabel(activeHomeSessionRemaining)}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-start px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
            <div className="text-center">
              <div className="relative min-h-[62px]">
                <div
                  className={cn(
                    "absolute inset-x-0 top-0 transition-all duration-500",
                    showHomeSessionIntro
                      ? homeSessionIntroPhase === "leaving"
                        ? "translate-y-[-4px] opacity-0"
                        : "translate-y-0 opacity-100"
                      : "pointer-events-none translate-y-[-4px] opacity-0",
                  )}
                >
                  <h1 className="mx-auto max-w-[360px] text-[28px] font-medium leading-[1.02] tracking-[-0.03em] text-foreground">
                    {homeSessionIntroTitle}
                  </h1>
                </div>
                <div
                  className={cn(
                    "absolute inset-x-0 top-0 transition-all duration-500",
                    showHomeSessionIntro
                      ? "pointer-events-none translate-y-2 opacity-0"
                      : "translate-y-0 opacity-100",
                  )}
                >
                  <p className="text-[12px] font-medium tabular-nums text-foreground/55">
                    {getSessionStepCounter(
                      homeSessionPlayerSteps.map((step) => step.id),
                      activeHomeSessionIndex,
                      isHomeSessionComplete,
                    )}
                  </p>
                  <h1 className="mt-1 text-[30px] font-medium leading-none tracking-[-0.03em] text-foreground">
                    {isHomeSessionComplete
                      ? "Session done"
                      : activeHomeRestPeriod
                        ? "Rest"
                        : activeHomeSessionStep?.title}
                  </h1>
                </div>
              </div>
            </div>

            {activeHomeRestPeriod ? (
              <div className="flex min-h-[42vh] flex-1 flex-col items-center justify-center px-4 text-center">
                {/* Rest is for recovering, so most of it is a breathing pacer
                    rather than footage of someone training -- a demo clip reads
                    as effort and argues with the copy telling you to slow down.
                    The next movement arrives in the last seconds instead, where
                    previewing it actually helps you prepare. */}
                {isHomeRestGetReady ? (
                  <div className="relative aspect-[4/5] max-h-[38vh] w-full max-w-[260px] overflow-hidden rounded-card bg-primary-strong">
                    {homeRestPreviewVideoSrc ? (
                      <video
                        key={`rest-preview-${activeHomeRestPeriod.id}`}
                        className="h-full w-full object-cover opacity-74"
                        loop
                        muted
                        playsInline
                        autoPlay={isHomeTimerRunning}
                        preload="metadata"
                        src={homeRestPreviewVideoSrc}
                      >
                        Your browser does not support the workout video.
                      </video>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/30">
                        <HomeRestNextIcon className="h-16 w-16" />
                      </div>
                    )}
                    <div className="absolute inset-x-3 bottom-3 rounded-chip border border-white/22 bg-black/38 px-3 py-2 text-left text-white backdrop-blur-md">
                      <p className="text-[11px] font-medium text-white/65">
                        Up next
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-[13px] font-semibold tracking-[-0.03em]">
                        {activeHomeRestPeriod.nextStep?.title}
                      </p>
                    </div>
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/38 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
                      Get ready
                    </span>
                  </div>
                ) : (
                  <div className="relative flex aspect-[4/5] max-h-[38vh] w-full max-w-[260px] items-center justify-center">
                    <div
                      aria-hidden
                      className={cn(
                        "absolute h-[190px] w-[190px] rounded-full bg-primary/8",
                        isHomeTimerRunning && "animate-rest-breathe",
                      )}
                    />
                    <div
                      aria-hidden
                      className={cn(
                        "absolute h-[140px] w-[140px] rounded-full border border-primary/22 bg-primary/10",
                        isHomeTimerRunning && "animate-rest-breathe",
                      )}
                      style={{ animationDelay: "-0.4s" }}
                    />
                    <div className="relative flex flex-col items-center gap-1 text-primary">
                      <TimerReset className="h-5 w-5" />
                      <span className="text-[30px] font-medium leading-none tracking-[-0.03em] tabular-nums text-foreground">
                        {Math.floor(homeRestSecondsLeft / 60)}:
                        {String(homeRestSecondsLeft % 60).padStart(2, "0")}
                      </span>
                      <span className="text-[12px] font-medium text-primary/70">
                        Rest
                      </span>
                    </div>
                  </div>
                )}
                <p className="mt-6 max-w-[310px] text-[20px] font-medium leading-[1.2] tracking-[-0.02em] text-foreground">
                  {activeHomeRestMessage}
                </p>
                {activeHomeRestPeriod.previousStep ? (
                  <button
                    type="button"
                    onClick={() => {
                      openHomeSetLoggerFor(
                        allWorkoutCards.find(
                          (c) => c.exerciseId === activeHomeRestPeriod.previousStep?.id,
                        ),
                      );
                    }}
                    className="glass mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-primary transition active:scale-[0.97]"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Log {activeHomeRestPeriod.previousStep.title}
                  </button>
                ) : null}
              </div>
            ) : isHomeSessionComplete ? (
              <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
                <div className="glass-dark w-full max-w-[340px] rounded-hero px-6 py-8">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand text-foreground">
                    <Check className="h-10 w-10" strokeWidth={3} />
                  </div>
                  <p className="mt-5 text-[12px] font-medium text-mint-medium">Session complete</p>
                  <p className="mt-1 text-[26px] font-medium tracking-[-0.02em]">Great work!</p>
                  <p className="mt-2 text-[13px] leading-5 text-white/60">You finished today&apos;s session. Rest up and come back stronger.</p>
                  <div className="mt-6 grid grid-cols-2 gap-2">
                    <div className="rounded-chip bg-white/10 px-3 py-3">
                      <p className="text-[11px] font-medium text-white/55">Duration</p>
                      <p className="mt-1 text-[16px] font-medium">
                        {selectedSession?.durationMin ?? 60}
                        <span className="text-[11px] font-medium text-white/50"> min</span>
                      </p>
                    </div>
                    <div className="rounded-chip bg-white/10 px-3 py-3">
                      <p className="text-[11px] font-medium text-white/55">Moves</p>
                      <p className="mt-1 text-[16px] font-medium">{homeSessionWorkoutSteps.length || 8}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex w-full max-w-[340px] flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowHomeSessionScreen(false)}
                    className="w-full rounded-full bg-primary-strong py-3.5 text-[14px] font-semibold text-white shadow-[0_14px_28px_rgba(12,39,35,0.2)] transition active:scale-[0.98]"
                  >
                    Back to workout
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const minutes = selectedSession?.durationMin ?? 60;
                      const text = workoutShareText(minutes);
                      const subject = "Workout Complete!";
                      // Route through the native bridge so the OS share sheet
                      // opens in the Flutter shell too — a raw navigator.share
                      // silently no-ops there. Render the card first; fall
                      // through to text-only if canvas fails.
                      try {
                        const image = await renderWorkoutShareCard({
                          minutes,
                          userName: state.profile?.name?.split(" ")[0],
                        });
                        await nativeBridge.device.shareImage({
                          text,
                          subject,
                          image,
                          filename: "fitmonk-workout",
                        });
                      } catch {
                        await nativeBridge.device.share({ text, subject }).catch(() => null);
                      }
                    }}
                    className="glass inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-[13px] font-semibold text-primary-strong transition active:scale-[0.98]"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share your achievement
                  </button>
                </div>
              </div>
            ) : (
              <div className="mx-auto mt-4 w-full max-w-[430px]">
                {/* Clean video hero — deep-teal frame, no decorative tint. */}
                <div className="relative aspect-[4/5] max-h-[52vh] overflow-hidden rounded-card bg-primary-strong shadow-[0_24px_50px_rgba(12,39,35,0.20)]">
                  {activeHomeSessionVideoSrc ? (
                    <video
                      key={`${activeHomeSessionStep?.id}-${activeHomeSessionVideoSrc}`}
                      ref={homeSessionVideoRef}
                      className="h-full w-full object-cover"
                      loop
                      muted
                      playsInline
                      autoPlay={isHomeTimerRunning}
                      preload="metadata"
                      src={activeHomeSessionVideoSrc}
                    >
                      Your browser does not support the workout video.
                    </video>
                  ) : activeOpenerKind && activeOpenerMove ? (
                    <SessionOpenerPlaceholder
                      kind={activeOpenerKind}
                      moveTitle={activeOpenerMove.title}
                      exerciseId={activeOpenerMove.exerciseId}
                      running={isHomeTimerRunning}
                    />
                  ) : null}
                  {nextHomeWorkoutStep ? (
                    <div className="absolute bottom-3 right-3 max-w-[172px] rounded-chip bg-foreground/55 p-2.5 text-white backdrop-blur-md">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/14 text-mint-medium">
                          <NextHomeWorkoutIcon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-mint-medium">
                            Next up
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-[1.05] tracking-[-0.03em]">
                            {nextHomeWorkoutStep.title}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Deep-teal control panel — same dark-surface language as the timeline hero. */}
                {activeOpenerMove ? (
                  <div className="glass-dark mt-3 rounded-card p-4">
                    <p className="text-[12px] font-medium text-mint-medium">
                      {activeOpenerMove.target}
                    </p>
                    <p className="mt-1 text-[15px] font-medium tracking-[-0.02em] text-white">
                      {activeOpenerMove.title}
                    </p>
                    <p className="mt-1.5 text-[13px] font-medium leading-[1.4] text-white/65">
                      {activeOpenerMove.guidance}
                    </p>
                  </div>
                ) : activeHomeWorkoutStepIndex >= 0 ? (
                  <div className="glass-dark mt-3 rounded-card p-4">
                    <p className="text-[13px] font-medium leading-[1.4] text-white/70">
                      {activeHomeSessionStep && 'replacement' in activeHomeSessionStep && activeHomeSessionStep.replacement
                        ? `${activeHomeSessionStep.replacement.valueLabel} · ${activeHomeSessionStep.replacement.guidance}`
                        : "Do minimum 3 sets, 15 reps each."}
                    </p>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={openHomeSetLogger}
                        className={cn(
                          "flex w-full items-center justify-center gap-2 rounded-full py-3 text-[13px] font-semibold transition active:scale-[0.98]",
                          completedActiveHomeSetCount >= Math.max(activeHomeSetDrafts.length, 1)
                            ? "bg-mint-medium text-[#07332C]"
                            : "bg-white/12 text-white",
                        )}
                      >
                        <Check className="h-4 w-4" />
                        {completedActiveHomeSetCount}/{Math.max(activeHomeSetDrafts.length, 1)} sets logged
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {activeHomeRestPeriod ? null : (
              <div className="flex shrink-0 items-center justify-center pt-5">
                <button
                  type="button"
                  onClick={isHomeTimerRunning ? handlePauseHomeSession : handleStartOrResumeHomeSession}
                  disabled={isHomeSessionComplete}
                  className={cn(
                    "flex h-16 w-16 items-center justify-center rounded-full transition active:scale-[0.96]",
                    isHomeSessionComplete
                      ? "glass text-primary/42"
                      : "bg-primary-strong text-white shadow-[0_18px_36px_rgba(12,39,35,0.24)]",
                  )}
                  aria-label={isHomeTimerRunning ? "Pause session" : "Play session"}
                >
                  {isHomeTimerRunning ? (
                    <Pause className="h-7 w-7" />
                  ) : isHomeSessionComplete ? (
                    <Check className="h-7 w-7" />
                  ) : (
                    <Play className="ml-0.5 h-7 w-7" />
                  )}
                </button>
              </div>
            )}
          </div>
          {homeSetLoggerOpen && homeSetLoggerExercise ? (
            <div className="glass-sheet absolute inset-x-0 bottom-0 z-20 rounded-t-[30px] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-foreground">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-primary/18" />
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-foreground/55">
                    Log set
                  </p>
                  <h2 className="mt-1 line-clamp-1 text-[19px] font-medium tracking-[-0.02em]">
                    {homeSetLoggerExercise.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setHomeSetLoggerOpen(false)}
                  className="glass-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/58 transition active:scale-[0.95]"
                  aria-label="Close set logger"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {homeSetLoggerDrafts.map((setDraft, index) => (
                  <button
                    key={`${homeSetLoggerExercise.exerciseId}-home-set-${index + 1}`}
                    type="button"
                    onClick={() => setHomeSetLoggerSetIndex(index)}
                    className={cn(
                      "flex h-9 min-w-12 items-center justify-center rounded-full border px-3 text-[12px] font-semibold transition active:scale-[0.97]",
                      homeSetLoggerSetIndex === index
                        ? "border-transparent bg-primary-strong text-white"
                        : setDraft.completed
                          ? "border-primary/14 bg-primary/10 text-primary"
                          : "border-foreground/10 bg-white text-foreground/54",
                    )}
                  >
                    {index + 1}
                    {setDraft.completed ? <Check className="ml-1 h-3 w-3" /> : null}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    handleAddGymSet(homeSetLoggerExercise);
                    setHomeSetLoggerSetIndex(homeSetLoggerDrafts.length);
                  }}
                  className="flex h-9 min-w-12 items-center justify-center rounded-full border border-dashed border-primary/30 bg-white px-3 text-primary transition active:scale-[0.97]"
                  aria-label="Add home workout set"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {homeSetLoggerPriorLog ? (
                <p className="mt-3 text-center text-[12px] font-medium text-foreground/50">
                  Last time: {formatLoadValue(homeSetLoggerPriorLog.loadValue)} kg ×{" "}
                  {homeSetLoggerPriorLog.reps ?? "-"} reps
                </p>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="glass-inset rounded-tile p-3">
                  <p className="text-[12px] font-medium text-foreground/55">
                    Reps
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setGymRepsPicker({
                        exerciseId: homeSetLoggerExercise.exerciseId,
                        setIndex: homeSetLoggerSetIndex,
                        value: homeSetLoggerDraft.reps,
                        source: "home",
                      })
                    }
                    className="mt-2 flex h-12 w-full items-center justify-center rounded-full border border-foreground/8 bg-white text-center transition active:scale-[0.97]"
                    aria-label={`${homeSetLoggerExercise.title} set ${homeSetLoggerSetIndex + 1} change reps`}
                  >
                    <span className="text-[24px] font-semibold tracking-[-0.05em]">
                      {homeSetLoggerDraft.reps}
                    </span>
                  </button>
                </div>

                <div className="glass-inset rounded-tile p-3">
                  <p className="text-[12px] font-medium text-foreground/55">
                    Load
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setGymWeightPicker({
                        exerciseId: homeSetLoggerExercise.exerciseId,
                        setIndex: homeSetLoggerSetIndex,
                        value: homeSetLoggerDraft.load,
                        source: "home",
                      })

                    }
                    className="mt-2 flex h-12 w-full items-center justify-center rounded-full border border-foreground/8 bg-white text-center transition active:scale-[0.97]"
                    aria-label={`${homeSetLoggerExercise.title} set ${homeSetLoggerSetIndex + 1} change load`}
                  >
                    <span className="text-[24px] font-semibold tracking-[-0.05em]">
                      {formatLoadValue(homeSetLoggerDraft.load)}
                    </span>
                  </button>
                  <p className="mt-1 text-center text-[11px] font-medium text-foreground/45">
                    kg
                  </p>
                </div>
              </div>

              <div className={cn("mt-3 grid gap-2", isPro ? "grid-cols-[44px_1fr]" : "grid-cols-1")}>
                {isPro ? (
                  <button
                    type="button"
                    onClick={() => handleVoiceGymSet(homeSetLoggerExercise)}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-full border transition active:scale-[0.96]",
                      voiceGymSetExerciseId === homeSetLoggerExercise.exerciseId
                        ? "border-transparent bg-primary-strong text-white"
                        : "border-primary/14 bg-primary/8 text-primary",
                    )}
                    aria-label="Log home set by voice"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => markHomeSetDone(homeSetLoggerExercise, homeSetLoggerSetIndex)}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-full px-4 text-[13.5px] font-semibold transition active:scale-[0.98]",
                    homeSetLoggerDraft.completed
                      ? "bg-primary/12 text-primary"
                      : "bg-primary-strong text-white shadow-[0_10px_22px_rgba(12,39,35,0.22)]",
                  )}
                >
                  {homeSetLoggerDraft.completed ? "Set added!" : "Mark set done"}
                </button>
              </div>
              {voiceGymSetExerciseId === homeSetLoggerExercise.exerciseId && voiceGymSetTranscript ? (
                <p className="mt-2 text-center text-[11px] font-medium text-foreground/54">
                  {voiceGymSetTranscript}
                </p>
              ) : voiceGymSetError ? (
                <VoiceErrorNote
                  message={voiceGymSetError}
                  className="mt-2 text-center text-[11px] font-medium text-[#9f3a2f]"
                />
              ) : null}
            </div>
          ) : null}

          {renderSetValuePickers()}

          {showReplaceExerciseModal && activeHomeSessionStep ? (
            <div className="absolute inset-0 z-30 flex items-end bg-black/40 backdrop-blur-sm">
              <div className="glass-sheet w-full rounded-t-[30px] pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
                <div className="mx-auto h-1.5 w-12 rounded-full bg-primary/18" />
                <div className="mt-4 flex items-start justify-between gap-3 px-5">
                  <div>
                    <p className="text-[12px] font-medium text-foreground/55">
                      Replace exercise
                    </p>
                    <h2 className="mt-1 text-[19px] font-medium tracking-[-0.02em] text-foreground">
                      Too hard? Pick an easier one
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReplaceExerciseModal(false)}
                    className="glass-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/58 transition active:scale-[0.95]"
                    aria-label="Close replace exercise"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 max-h-[52vh] overflow-y-auto px-4">
                  <div className="grid gap-2">
                    {HOME_EASIER_ALTERNATIVES.map((alt) => {
                      const isActive = replacedHomeExercises[activeHomeSessionStep.id]?.exerciseId === alt.exerciseId;
                      return (
                        <button
                          key={alt.exerciseId}
                          type="button"
                          onClick={() => {
                            setReplacedHomeExercises((current) => ({
                              ...current,
                              [activeHomeSessionStep.id]: alt,
                            }));
                            setShowReplaceExerciseModal(false);
                          }}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-tile border p-3.5 text-left transition active:scale-[0.99]",
                            isActive
                              ? "border-primary/22 bg-primary/8"
                              : "border-foreground/8 bg-white hover:border-primary/20",
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Shuffle className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-medium tracking-[-0.01em] text-foreground">
                              {alt.title}
                            </p>
                            <p className="mt-0.5 text-[11px] font-semibold text-primary/70">
                              {alt.targetLabel} · {alt.valueLabel}
                            </p>
                            <p className="mt-1 text-[12px] leading-[1.4] text-foreground/52">
                              {alt.guidance}
                            </p>
                          </div>
                          {isActive ? (
                            <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  // Today's focus picker. Rendered in the Gym hero and in the Home session
  // bar, so it takes its text colour from wherever it sits.
  const focusPicker = (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setShowFocusDropdown((d) => !d)}
        className="inline-flex items-center gap-1 text-current transition hover:opacity-75"
      >
        {focusMode === "rest"
          ? "Rest day"
          : focusMode === "customize"
            ? customizeRoutineName || "Customize"
            : activeCustomRoutineName || muscleFocusLabel}
        <ChevronDown
          className={cn(
            "h-4 w-4 opacity-70 transition-transform duration-200",
            showFocusDropdown && "rotate-180",
          )}
        />
      </button>

      {showFocusDropdown ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowFocusDropdown(false)}
          />
          <div className="glass-sheet absolute left-0 top-full z-20 mt-2 max-h-[60vh] w-[204px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[20px] py-1.5 text-[15px] leading-normal tracking-normal text-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {MUSCLE_FOCUS_VALUES.map((focus) => {
              const isActive =
                focus === muscleFocus && focusMode === "normal" && !activeCustomRoutine;
              return (
                <button
                  key={focus}
                  type="button"
                  onClick={() => {
                    handleSelectMuscleFocus(focus);
                    setFocusModeByDate((c) => ({ ...c, [selectedDate]: "normal" }));
                    setShowFocusDropdown(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-black/4"
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-primary">
                    {isActive ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] font-semibold leading-none",
                      isActive ? "text-primary" : "text-foreground",
                    )}
                  >
                    {getMuscleFocusLabel(focus)}
                  </span>
                </button>
              );
            })}
            <div className="my-1 border-t border-black/6" />
            <button
              type="button"
              onClick={() => {
                setFocusModeByDate((c) => ({ ...c, [selectedDate]: "rest" }));
                setShowFocusDropdown(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-black/4"
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-primary">
                {focusMode === "rest" ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              <span
                className={cn(
                  "text-[13px] font-semibold leading-none",
                  focusMode === "rest" ? "text-primary" : "text-foreground",
                )}
              >
                Rest day
              </span>
            </button>

            {/* Saved custom routines (e.g. "Mix 3") */}
            {savedCustomRoutines.length > 0 ? (
              <>
                <div className="my-1 border-t border-black/6" />
                <p className="px-3 pb-1 pt-1 text-[12px] font-medium text-foreground/50">
                  My routines
                </p>
                {savedCustomRoutines.map((routine) => {
                  const isActive =
                    focusMode === "normal" && activeCustomRoutine?.id === routine.id;
                  return (
                    <div
                      key={routine.id}
                      className="flex w-full items-center gap-2 px-3 py-2 transition hover:bg-black/4"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectCustomRoutine(routine.id);
                          setShowFocusDropdown(false);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-primary">
                          {isActive ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        <span
                          className={cn(
                            "truncate text-[13px] font-semibold leading-none",
                            isActive ? "text-primary" : "text-foreground",
                          )}
                        >
                          {routine.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleEditCustomRoutine(routine.id);
                          setShowFocusDropdown(false);
                        }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-foreground/42 transition hover:bg-black/6 hover:text-foreground"
                        aria-label={`Edit ${routine.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </>
            ) : null}

            <div className="my-1 border-t border-black/6" />
            <button
              type="button"
              onClick={() => {
                handleCreateCustomRoutine();
                setShowFocusDropdown(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-black/4"
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-primary">
                {focusMode === "customize" ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5 text-foreground/45" />}
              </span>
              <span
                className={cn(
                  "text-[13px] font-semibold leading-none",
                  focusMode === "customize" ? "text-primary" : "text-foreground",
                )}
              >
                Customize
              </span>
            </button>
          </div>
        </>
      ) : null}
    </span>
  );

  // Ring timer: share of the session elapsed, never drawn as nothing once the
  // clock has started, plus where each step begins along the ring.
  const homeRingProgress = isHomeWorkoutCompleted
    ? 1
    : homeElapsedSeconds > 0
      ? Math.max(0.03, clamp(homeElapsedSeconds / Math.max(homeTotalSeconds, 1), 0, 1))
      : 0;
  // Daily wins, Protein, Plan day and Muscle coverage. Gym shows them as full
  // tiles under the hero; Home shows them as a row inside the session bar.
  const renderStatTiles = (variant: "full" | "mini") => (
    <div className={variant === "mini" ? undefined : "mt-2.5"}>
      <div
        className={
          variant === "mini" ? "grid grid-cols-4 gap-1.5" : "grid grid-cols-2 gap-2.5"
        }
      >
        {[
          {
            id: "milestone",
            label: "Daily wins",
            shortLabel: "Daily wins",
            icon: Target,
            value: completedQuestCount,
            suffix: `/${dailyQuests.length}`,
            ratio: dailyQuests.length > 0 ? completedQuestCount / dailyQuests.length : 0,
            segments: dailyQuests.length,
            href: null,
          },
          {
            id: "protein",
            label: "Protein",
            shortLabel: "Protein",
            icon: Utensils,
            value: Math.round(todayNutrition.proteinG),
            suffix: proteinTargetG > 0 ? `/${proteinTargetG}g` : "g",
            ratio:
              proteinTargetG > 0
                ? Math.min(1, todayNutrition.proteinG / proteinTargetG)
                : 0,
            segments: 1,
            // Doubles as the meal CTA the hero art used to carry.
            href: "/diet",
          },
          {
            id: "plan",
            label: "Plan day",
            shortLabel: "Plan day",
            icon: CalendarDays,
            value: goalCycle ? goalCycle.dayNumber : 0,
            suffix: goalCycle ? `/${goalCycle.totalDays}` : "",
            ratio: goalCycle ? goalCycle.progress / 100 : 0,
            segments: 1,
            href: "/workout/plan",
          },
        ].map((tile) => {
          const TileIcon = tile.icon;
          // Only one tile reads as "active" (orange glass tint) at a time.
          // When the Coverage drawer is open, Coverage owns the highlight;
          // otherwise Plan day carries the default emphasis.
          const isTint = tile.id === "plan" && !isCoverageExpanded;
          const tileSurface = cn(
            "w-full text-left transition active:scale-[0.98]",
            variant === "mini"
              ? "flex flex-col items-center justify-center rounded-[14px] px-1 py-1.5 text-center"
              : "flex h-[118px] flex-col rounded-[22px] px-3 py-3",
            isTint ? "glass-tint" : variant === "mini" ? "glass-inset" : "glass",
          );
          const filledBars = Math.round(tile.ratio * 5);
          const fullBody = (
            <>
              <span className="flex items-center gap-2">
                <IconBadge tone={isTint ? "dark" : "light"}>
                  <TileIcon className="h-4 w-4" />
                </IconBadge>
                <span className="text-[12px] leading-tight">{tile.label}</span>
                {tile.href ? (
                  <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
                ) : null}
              </span>
              <span className="mt-auto flex items-end justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="text-[32px] font-light leading-none tracking-[-0.04em]">
                    {tile.value}
                  </span>
                  <span className="text-[12px] opacity-60">{tile.suffix}</span>
                </span>
                {tile.id === "milestone" ? (
                  // One glyph per quest, solid once it's done.
                  <span className="mb-1 flex shrink-0 gap-1">
                    {dailyQuests.map((quest) => {
                      const QuestIcon = quest.icon;
                      return (
                        <QuestIcon
                          key={`tile-${quest.id}`}
                          className={cn(
                            "h-3.5 w-3.5",
                            quest.completed ? "text-forest" : "opacity-35",
                          )}
                        />
                      );
                    })}
                  </span>
                ) : tile.id === "protein" ? (
                  // Five rising bars, filled to today's share of the target.
                  <span className="mb-1 flex shrink-0 items-end gap-[3px]" aria-hidden="true">
                    {[6, 9, 12, 15, 18].map((height, index) => (
                      <span
                        key={`protein-bar-${height}`}
                        className={cn(
                          "w-[4px] rounded-full",
                          index < filledBars ? "bg-forest" : "bg-foreground/15",
                        )}
                        style={{ height }}
                      />
                    ))}
                  </span>
                ) : (
                  <svg viewBox="0 0 24 24" className="mb-0.5 h-6 w-6 shrink-0 -rotate-90" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 9}
                      strokeDashoffset={2 * Math.PI * 9 * (1 - clamp(tile.ratio, 0, 1))}
                    />
                  </svg>
                )}
              </span>
            </>
          );
          // Inside the Home session bar: just the number, the bar owns the screen.
          const miniBody = (
            <>
              <span className="flex w-full min-w-0 items-center justify-center gap-1 text-[10px]">
                <TileIcon className="h-3 w-3 shrink-0 opacity-70" />
                <span className="truncate opacity-60">{tile.shortLabel}</span>
              </span>
              <span className="block w-full truncate text-[15px] leading-tight">
                {tile.value}
                <span className="text-[10px] opacity-60">{tile.suffix}</span>
              </span>
            </>
          );
          const body = variant === "mini" ? miniBody : fullBody;

          if (tile.href) {
            return (
              <Link
                key={tile.id}
                href={tile.href}
                className={tileSurface}
              >
                {body}
              </Link>
            );
          }

          // The Daily Wins tile opens a popover breaking down the three
          // quests behind the count so the number isn't a mystery.
          if (tile.id === "milestone") {
            return (
              <div
                key={tile.id}
                className={cn("relative", showDailyWinsBreakdown && "z-20")}
              >
                <button
                  type="button"
                  onClick={() => setShowDailyWinsBreakdown((current) => !current)}
                  aria-expanded={showDailyWinsBreakdown}
                  aria-label="See how Daily wins is calculated"
                  className={tileSurface}
                >
                  {body}
                </button>

                {showDailyWinsBreakdown ? (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowDailyWinsBreakdown(false)}
                    />
                    <div className="glass-sheet absolute left-0 top-full z-20 mt-2 w-[240px] max-w-[calc(100vw-2rem)] rounded-[20px] p-2 text-foreground">
                      <p className="px-2 pb-1 pt-1 text-[12px] font-medium text-foreground/55">
                        Today&apos;s wins
                      </p>
                      <ul className="space-y-0.5">
                        {dailyQuests.map((quest) => {
                          const QuestIcon = quest.icon;
                          return (
                            <li
                              key={quest.id}
                              className="flex items-center gap-2.5 rounded-[12px] px-2 py-1.5"
                            >
                              <span
                                className={cn(
                                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                                  quest.completed
                                    ? "border-transparent bg-primary text-white"
                                    : "border-foreground/20 text-foreground/55",
                                )}
                              >
                                {quest.completed ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <QuestIcon className="h-4 w-4" />
                                )}
                              </span>
                              <span
                                className={cn(
                                  "text-[13.5px] leading-tight",
                                  quest.completed
                                    ? "text-foreground"
                                    : "text-foreground/58",
                                )}
                              >
                                {quest.label}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </>
                ) : null}
              </div>
            );
          }

          return (
            <div
              key={tile.id}
              className={tileSurface}
            >
              {body}
            </div>
          );
        })}
        <MuscleCoverageCard
          layout={variant === "mini" ? "mini-tile" : "tile"}
          entries={muscleCoverage}
          score={muscleCoverageScore}
          onAddFinisher={handleOpenFinisherLibrary}
          expanded={isCoverageExpanded}
          onExpandedChange={setIsCoverageExpanded}
        />
      </div>
    </div>
  );

  const isHomeSessionRecorded = isSessionRecorded(state.workoutLogs, sessionId, selectedDate);
  const saveFinishedHomeSession = () => {
    setHomeTimerBaseSeconds(homeTotalSeconds);
    setHomeTimerStartedAt(null);
    setHomeTimerNow(Date.now());
    if (!isHomeSessionRecorded) {
      completeWorkout(sessionId, allIds, selectedDate);
    }
  };

  return (
    <div className="pb-4 pt-0">
      <HomeSessionAutoSaver
        shouldSave={shouldAutoSaveHomeSession({
          environment: selectedWorkoutEnvironment,
          timerLoaded: homeTimerLoadedForDate === selectedDate,
          isTrainingSession: focusMode === "normal",
          sessionId,
          elapsedSeconds: homeElapsedSeconds,
          totalSeconds: homeTotalSeconds,
          allExercisesLogged: allDone,
          alreadyRecorded: isHomeSessionRecorded,
        })}
        onSave={saveFinishedHomeSession}
      />
      {environmentTheme.viewportOverlay ? (
        <div
          className={cn(
            "pointer-events-none fixed inset-0 -z-10 transition-opacity duration-300",
            environmentTheme.viewportOverlay,
          )}
        />
      ) : null}
      <section className="glass-ui relative overflow-x-clip px-4 pb-5 pt-[calc(0.75rem+var(--safe-top))] sm:px-5">
        <GlassBackdrop />
        <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-28", environmentTheme.topFade)} />
        <div
          className={cn(
            "pointer-events-none absolute -right-12 top-20 h-36 w-36 rounded-full blur-3xl",
            environmentTheme.topOrb,
          )}
        />
        <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/50">
              {getGreeting()}
            </p>
            <h1
              className="mt-0.5 truncate font-semibold leading-tight tracking-[-0.04em] text-foreground"
              style={{ fontSize: "clamp(18px, 6.5vw, 30px)" }}
            >
              {state.profile.name.split(" ")[0]}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-3 self-start">
            <div
              className="glass rounded-full px-3.5 py-2"
            >
              <div
                className={cn(
                  "flex items-center gap-2 text-[14px] font-semibold",
                  state.streak === 0 && "text-accent",
                )}
              >
                <Image
                  src="/fire-streak.svg"
                  alt=""
                  aria-hidden="true"
                  width={16}
                  height={16}
                  className={cn("h-4 w-4 shrink-0", state.streak === 0 && "opacity-60")}
                />
                {state.streak} {state.streak === 1 ? "day" : "days"}
              </div>
            </div>
            <div className="glass relative flex h-11 w-[112px] items-center rounded-full p-1">
              <div
                className={cn(
                  // Frosted dark thumb rather than a solid pill, so the toggle
                  // reads as one piece of glass.
                  "glass-dark-inset pointer-events-none absolute top-1 h-9 w-[54px] rounded-full transition-transform duration-300 ease-out",
                  selectedWorkoutEnvironment === "home" ? "translate-x-0" : "translate-x-[50px]",
                )}
              />
              {(
                [
                  { value: "home", label: "Home", icon: HomeToggleIcon },
                  // Not the dumbbell: that's the Workout tab's own icon in the nav bar.
                  { value: "gym", label: "Gym", icon: Weight },
                ] as const
              ).map((option) => {
                const isSelected = selectedWorkoutEnvironment === option.value;
                const isLocked =
                  unlockedWorkoutEnvironment !== null &&
                  unlockedWorkoutEnvironment !== option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (isLocked) {
                        setLockedEnvironmentPrompt(option.value);
                        return;
                      }

                      setSelectedWorkoutEnvironment(option.value);
                    }}
                    className={cn(
                      "relative z-[1] flex h-9 flex-1 items-center justify-center rounded-full transition active:scale-[0.96]",
                      isSelected
                        ? "text-white"
                        : isLocked
                          // Muted enough to read as unavailable on its own, so no
                          // lock badge is needed cluttering a 36px control.
                          ? "text-foreground/20"
                          : "text-foreground/46 hover:text-foreground/70",
                    )}
                    aria-label={
                      isLocked
                        ? `${option.label} workouts locked`
                        : `Switch to ${option.label} workouts`
                    }
                    aria-disabled={isLocked}
                    title={option.label}
                  >
                    <option.icon
                      className={cn(
                        "h-4 w-4 transition-transform duration-300",
                        isSelected && "scale-110 drop-shadow-[0_3px_8px_rgba(255,255,255,0.28)]",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {selectedWorkoutEnvironment === "home" ? (
          // Home sessions only run today, so the week shrinks to a slim,
          // display-only strip: same days and history dots as the Gym strip,
          // scrolled to today, leaving room for the session bar and its stats.
          <div className="glass mt-4 flex items-center gap-1.5 rounded-[18px] py-1.5 pl-3 pr-1.5">
            <span className="shrink-0 text-[10px] font-medium text-foreground/55">
              {workoutWeekLabel.replace(/^Week/, "Wk")}
            </span>
            <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {dateOptions.map((date) => {
                const isoDate = format(date, "yyyy-MM-dd");
                const isToday = isoDate === todayIso;
                const isFutureDate = isoDate > todayIso;
                const daySession = getSessionForDate(workoutPlan, isoDate);
                const wasCompleted = hasLoggedWorkoutForDate(isoDate);

                return (
                  <div
                    key={isoDate}
                    id={`workout-date-${isoDate}`}
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      "flex shrink-0 flex-col items-center rounded-[11px] py-1 text-center leading-none",
                      isToday
                        ? "glass-dark-inset min-w-[38px] px-1"
                        : cn("min-w-[30px]", isFutureDate ? "text-foreground/30" : "text-foreground/60"),
                    )}
                  >
                    <span className="text-[9px] uppercase">{format(date, "EEEEE")}</span>
                    <span className="mt-0.5 text-[12px] font-medium">{format(date, "d")}</span>
                    <span className="mt-1 flex h-2 items-center">
                      {isFutureDate ? (
                        <Lock className="h-2 w-2" aria-hidden="true" />
                      ) : (
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full border border-current/30",
                            wasCompleted
                              ? "bg-current"
                              : daySession?.isRestDay
                                ? "bg-current/25"
                                : "bg-transparent",
                          )}
                        />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="glass mt-4 rounded-[22px] px-2 pb-1.5 pt-2.5">
            <div className="flex items-center gap-2 px-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground/50">
              <CalendarDays className="h-3.5 w-3.5 text-foreground/45" />
              {workoutWeekLabel}
            </div>

            <div className="mt-1.5 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {dateOptions.map((date) => {
                const isoDate = format(date, "yyyy-MM-dd");
                const isSelected = isoDate === selectedDate;
                const daySession = getSessionForDate(workoutPlan, isoDate);
                const wasCompleted = hasLoggedWorkoutForDate(isoDate);
                // Future days open the "locked" card, so they say so up front.
                const isFutureDate = isoDate > todayIso;

                return (
                  <button
                    key={isoDate}
                    id={`workout-date-${isoDate}`}
                    className={cn(
                      "min-w-[44px] shrink-0 rounded-chip border px-2 py-1.5 text-center transition active:scale-[0.98]",
                      isSelected
                        ? cn(
                            environmentTheme.selectedDate,
                            "shadow-[0_12px_22px_rgba(21,47,39,0.22),inset_0_1px_0_rgba(255,255,255,0.28)]",
                          )
                        : isFutureDate
                          ? "border-transparent text-foreground/38 hover:text-foreground/60"
                          : "border-transparent text-foreground/70 hover:bg-white/50 hover:text-foreground",
                    )}
                    onClick={() => setSelectedDate(isoDate)}
                    type="button"
                  >
                    <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-current/62">
                      {format(date, "EEEEE")}
                    </div>
                    <div className="mt-1 text-[17px] font-semibold leading-none">
                      {format(date, "d")}
                    </div>
                    <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-current/50">
                      {format(date, "MMM")}
                    </div>
                    <div className="mt-1 flex h-2.5 items-center justify-center">
                      {isFutureDate ? (
                        <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                      ) : (
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full border border-current/10",
                            wasCompleted
                              ? "bg-current"
                              : daySession?.isRestDay
                                ? "bg-current/20"
                                : "bg-transparent",
                          )}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

          </div>
        )}

        {isFutureSelectedDate ? (
          <div className="mt-6 flex flex-col items-center justify-center glass rounded-hero px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/8">
              <Lock className="h-5 w-5 text-foreground/50" />
            </div>
            <p className="mt-4 text-[16px] font-semibold tracking-[-0.03em] text-foreground">
              This day is locked
            </p>
            <p className="mt-1 max-w-[240px] text-[13px] leading-[1.5] text-foreground/50">
              Upcoming days unlock when they arrive. Focus on today to keep your streak going.
            </p>
          </div>
        ) : (
        <>
        {selectedWorkoutEnvironment === "gym" ? (
          // Design A hero: today's focus, its picker, and progress at a glance.
          // Each blurred card is its own stacking context, so the hero sits a
          // layer up or its focus picker would open beneath the tiles.
          <div className="glass-dark relative z-20 mt-3 rounded-hero px-4 pb-4 pt-3.5">
            <div className="flex items-center justify-between gap-3">
              <IconBadge tone="dark">
                <Dumbbell className="h-4 w-4" />
              </IconBadge>
              {focusMode !== "normal" || allWorkoutCards.length === 0 ? null : allDone ? (
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/35 text-white"
                  aria-label="All exercises logged"
                >
                  <Check className="h-4.5 w-4.5" />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenNextGymExercise}
                  aria-label="Open next exercise"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-primary-strong transition active:scale-[0.96]"
                >
                  <Play className="h-4.5 w-4.5 fill-current" />
                </button>
              )}
            </div>
            <p className="mt-3 text-[12px] font-medium text-white/70">Today&apos;s focus</p>
            <div className="mt-0.5 text-[22px] font-medium leading-tight tracking-[-0.02em]">
              {focusPicker}
            </div>
            {focusMode === "normal" && allWorkoutCards.length > 0 ? (
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-[40px] font-light leading-none tracking-[-0.04em]">
                    {loggedGymWorkoutCount}
                  </span>
                  <span className="text-[12px] text-white/60">
                    /{allWorkoutCards.length} done
                  </span>
                </div>
                <div className="relative flex h-4 min-w-0 max-w-[150px] flex-1 items-center justify-between" aria-hidden="true">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-white/30" />
                  {allWorkoutCards.map((exercise) => {
                    const isLogged = isGymExerciseLogged(exercise);
                    const isNext = !isLogged && exercise.exerciseId === nextGymExercise?.exerciseId;
                    return (
                      <span
                        key={`hero-dot-${exercise.exerciseId}`}
                        className={cn(
                          "relative rounded-full",
                          isNext
                            ? "h-4 w-4 bg-white"
                            : isLogged
                              ? "h-2 w-2 bg-white"
                              : "h-1.5 w-1.5 bg-white/55",
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          // Home session bar: ring timer, focus picker, start control and the
          // day's four stats. Pinned under the status bar so the session is
          // always one tap away; the stats row folds away while it's pinned.
          <>
            <div ref={setSessionBarSentinel} aria-hidden="true" className="h-0" />
            <div className="glass sticky top-[calc(0.5rem+var(--safe-top))] z-30 mt-3 rounded-[24px] p-2.5">
              <div className="flex items-center gap-3 pr-0.5">
                {focusMode === "normal" ? (
                  <div className="relative h-[48px] w-[48px] shrink-0">
                    <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90" aria-hidden="true">
                      <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(14,75,69,0.12)" strokeWidth="4.5" />
                      <circle
                        cx="24"
                        cy="24"
                        r="20"
                        fill="none"
                        stroke="var(--primary)"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 20}
                        strokeDashoffset={2 * Math.PI * 20 * (1 - homeRingProgress)}
                        className="transition-[stroke-dashoffset] duration-700 ease-out"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium tabular-nums">
                      {isHomeWorkoutCompleted ? (
                        <Check className="h-5 w-5 text-primary-strong" strokeWidth={2.5} aria-label="Session complete" />
                      ) : (
                        formatTimerLabel(homeElapsedSeconds)
                      )}
                    </span>
                  </div>
                ) : (
                  <IconBadge className="ml-1">
                    <HomeToggleIcon className="h-4 w-4" />
                  </IconBadge>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-foreground/55">
                    {focusMode !== "normal"
                      ? "Today's focus"
                      : isHomeWorkoutCompleted
                        ? "Session complete"
                        : isHomeTimerRunning
                          ? "Session running"
                          : homeElapsedSeconds > 0
                            ? "Session paused"
                            : "Home session"}
                  </p>
                  <div className="text-[17px] font-medium leading-tight tracking-[-0.02em]">
                    {focusPicker}
                  </div>
                  {focusMode === "normal" ? (
                    <p className="mt-0.5 truncate text-[11px] text-foreground/55">
                      {isHomeWorkoutCompleted
                        ? getHomeSessionCompleteNote(homeElapsedSeconds, homeTotalSeconds)
                        : `${homeMinutesLeft} min left · ${homeMovesRemaining} ${homeMovesRemaining === 1 ? "move" : "moves"} to go`}
                    </p>
                  ) : null}
                </div>
                {focusMode === "normal" ? (
                  <button
                    type="button"
                    onClick={
                      isHomeTimerRunning
                        ? handlePauseHomeSession
                        : handleOpenHomeSessionScreen
                    }
                    disabled={isHomeWorkoutCompleted}
                    className={cn(
                      "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition active:scale-[0.98]",
                      isHomeWorkoutCompleted
                        ? "cursor-default border border-foreground/10 text-foreground/50"
                        : isHomeTimerRunning
                          ? "border border-foreground/15 text-foreground"
                          : "bg-accent text-white shadow-[0_10px_22px_rgba(242,132,58,0.28)]",
                    )}
                  >
                    {isHomeWorkoutCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : isHomeTimerRunning ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" />
                    )}
                    {isHomeWorkoutCompleted
                      ? "Done"
                      : isHomeTimerRunning
                        ? "Pause"
                        : requiresReadinessBeforeStart
                          ? "Check in"
                          : homeElapsedSeconds > 0
                            ? "Resume"
                            : "Start"}
                  </button>
                ) : null}
              </div>
              {isSessionBarPinned && !isCoverageExpanded ? null : (
                <div className="mt-2.5 border-t border-foreground/8 pt-2.5">
                  {renderStatTiles("mini")}
                </div>
              )}
            </div>
          </>
        )}

        {selectedWorkoutEnvironment === "gym" ? renderStatTiles("full") : null}


        {selectedWorkoutEnvironment === "home" && readinessAdjustment ? (
          isPro ? (
            // Mode "normal" (label "Push-ready") means nothing was adapted,
            // so there's nothing to communicate — the session bar above
            // already shows duration and exercise count. Only surface the
            // card when the session actually differs from the default.
            readinessAdjustment.mode !== "normal" ? (
              <div className="mt-4 glass flex items-center justify-between gap-3 rounded-card px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/70">
                    Adaptive workout
                  </p>
                  <p className="mt-0.5 text-[14px] font-semibold tracking-[-0.02em] text-foreground">
                    {readinessAdjustment.label}
                  </p>
                </div>
                <HeartPulse className="h-4 w-4 shrink-0 text-primary/60" />
              </div>
            ) : null
          ) : (
            // Starter home users don't get readiness-driven adaptation. This
            // card doubles as their conversion surface for Pro — the paywall
            // opens with feature=adaptive-coach so the copy is on-point.
            <button
              type="button"
              onClick={() =>
                router.push("/paywall?upgrade=1&feature=adaptive-coach&return=/workout")
              }
              className="mt-4 block w-full glass rounded-card p-4 text-left transition active:scale-[0.99]"
              aria-label="Unlock adaptive home sessions with Pro"
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/70">
                  Pro preview
                </p>
                <h3 className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-foreground">
                  Today could adapt in Pro
                </h3>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-chip bg-primary/7 px-3 py-2 text-[12px] font-semibold text-primary">
                <span>Starter keeps the standard workout. Unlock adaptive in Pro.</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </div>
            </button>
          )
        ) : selectedWorkoutEnvironment === "home" && requiresReadinessBeforeStart ? (
          <button
            type="button"
            onClick={() => {
              if (!isPro) {
                router.push("/paywall?upgrade=1&feature=adaptive-coach&return=/workout");
                return;
              }
              window.dispatchEvent(new Event("dietfit-open-readiness-check-in"));
            }}
            className="glass mt-3 flex w-full items-center gap-3 rounded-[20px] px-3 py-2.5 text-left transition active:scale-[0.99]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <HeartPulse className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                {isPro ? "Check in before you train" : "Adaptive sessions in Pro"}
              </span>
              <span className="mt-0.5 block text-[11px] leading-[1.35] text-foreground/58">
                {isPro
                  ? "A 20-second readiness check tunes today's sets to how you feel."
                  : "Pick a length or tune today's workout to how you feel with Pro."}
              </span>
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/14 text-primary">
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        ) : null}

        {focusMode === "rest" ? (
          <div className="mt-6 flex flex-col items-center gap-4 glass rounded-card px-5 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" />
                <path d="M8 12h8" />
              </svg>
            </div>
            <div>
              <p className="text-[20px] font-semibold tracking-[-0.04em] text-foreground">Rest day</p>
              <p className="mt-1.5 text-[13px] leading-5 text-foreground/58">
                Recovery is part of progress. Take it easy today. You&apos;ve earned it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFocusModeByDate((c) => ({ ...c, [selectedDate]: "normal" }))}
              className="mt-1 rounded-full border border-primary/22 bg-white/62 px-4 py-2 text-[13px] font-semibold text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition active:scale-[0.97]"
            >
              Back to workouts
            </button>
          </div>
        ) : focusMode === "customize" ? (
          (() => {
            const customizeRoutine = draftGymRoutinesByDate[selectedDate] ?? [];

            return (
              <div className="mt-4">
                <div className="flex flex-col gap-3">
                  {customizeRoutine.length === 0 ? (
                    <button
                      type="button"
                      onClick={handleOpenCustomizeLibrary}
                      className="flex flex-col items-center gap-3 rounded-card border border-dashed border-primary/28 bg-primary/5 px-5 py-8 text-center transition active:scale-[0.99] hover:bg-primary/10"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Plus className="h-7 w-7" />
                      </div>
                      <div>
                        <p className="text-[17px] font-semibold tracking-[-0.03em] text-foreground">
                          Build your routine
                        </p>
                        <p className="mt-1 text-[13px] leading-5 text-foreground/56">
                          Add exercises to create your own custom workout for today.
                        </p>
                      </div>
                    </button>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3 px-1">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-foreground/42">
                          {customizeRoutineName || "My routine"}
                        </p>
                        <p className="text-[12px] font-medium text-foreground/44">
                          {customizeRoutine.length}{" "}
                          {customizeRoutine.length === 1 ? "exercise" : "exercises"}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        {customizeRoutine.map((exercise) => (
                          <div
                            key={exercise.exerciseId}
                            className="flex items-center justify-between gap-3 glass rounded-tile px-3 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-semibold tracking-[-0.03em] text-foreground">
                                {exercise.title}
                              </p>
                              <p className="mt-0.5 truncate text-[12px] font-medium text-foreground/48">
                                {exercise.target} · {exercise.reps}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomizeWorkout(exercise.exerciseId)}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/56 bg-white/58 text-[#7b1d1d] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition active:scale-[0.96]"
                              aria-label={`Remove ${exercise.title}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenCustomizeLibrary}
                        className="flex items-center justify-center gap-2 rounded-card border border-dashed border-primary/30 bg-primary/8 py-4 text-[14px] font-semibold text-primary transition active:scale-[0.98] hover:bg-primary/12"
                      >
                        <Plus className="h-4 w-4" />
                        Add exercises
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenStartRoutinePrompt}
                        className="mt-1 flex items-center justify-center gap-2 rounded-card bg-primary-strong py-4 text-[15px] font-semibold text-white shadow-[0_12px_26px_rgba(12,39,35,0.2)] transition active:scale-[0.98]"
                      >
                        <Play className="h-4 w-4" />
                        Save &amp; start routine
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })()
        ) : (
          <>

        <div className="mt-4">
          {selectedWorkoutEnvironment === "home" ? (
            <>
            {/* Timer, state and play/pause live in the hero card above. */}
            <div>
              <div className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 gap-y-2.5">
                <div className="pointer-events-none absolute left-[17px] top-5 bottom-5 w-[3px] rounded-full bg-primary/14" />
                <div
                  className="pointer-events-none absolute left-[17px] top-5 w-[3px] rounded-full bg-[linear-gradient(180deg,_var(--primary),_var(--mint-medium))] transition-[height] duration-700"
                  style={{ height: `calc((100% - 40px) * ${isHomeWorkoutCompleted ? 1 : homeTimelineDoneRatio})` }}
                />
                {homeTimelineMilestones.map((milestone, milestoneIndex) => {
                  // Numbered like the guided player's "3/8": Stretching,
                  // Warm-up and each exercise. Rest rows and the final Done
                  // row aren't steps, so they show an icon instead.
                  const isNumberedMilestone =
                    milestone.kind === "prep" ||
                    milestone.kind === "warmup" ||
                    milestone.kind === "workout";
                  const milestoneStepNumber = homeTimelineMilestones
                    .slice(0, milestoneIndex + 1)
                    .filter(
                      (item) =>
                        item.kind === "prep" || item.kind === "warmup" || item.kind === "workout",
                    ).length;
                  const isMilestoneDone = isHomeMilestoneDone(milestone);
                  const isExpanded = expandedHomeMilestones.includes(milestone.id);
                  const isWorkoutMilestone = milestone.kind === "workout";
                  const isFinishMilestone = milestone.kind === "finish";
                  const isActiveMilestone = activeHomeMilestoneId === milestone.id;
                  const isLockedWorkout = isWorkoutMilestone && !isHomeWarmupComplete;
                  const exercise = "exercise" in milestone ? milestone.exercise : null;
                  const MilestoneIcon =
                    milestone.kind === "prep"
                      ? StretchIcon
                      : milestone.kind === "warmup"
                        ? Flame
                        : milestone.kind === "finish"
                          ? Check
                          : milestone.kind === "rest"
                            ? Pause
                            : exercise?.icon ?? Dumbbell;
                  const timelineSetDrafts = exercise ? getGymSetDrafts(exercise) : [];
                  const completedTimelineSetCount = timelineSetDrafts.filter(
                    (setDraft) => setDraft.completed,
                  ).length;
                  const nextTimelineSetIndex = Math.min(
                    completedTimelineSetCount,
                    Math.max(timelineSetDrafts.length - 1, 0),
                  );
                  const timelineSetIndex = exercise
                    ? Math.min(
                        homeTimelineSetIndexByExercise[exercise.exerciseId] ??
                          nextTimelineSetIndex,
                        Math.max(timelineSetDrafts.length - 1, 0),
                      )
                    : 0;
                  const timelineSetDraft =
                    timelineSetDrafts[timelineSetIndex] ??
                    timelineSetDrafts[0] ?? {
                      reps: 12,
                      load: exercise ? getHomeDefaultLoad(exercise) : HOME_BASE_LOAD_VALUE,
                      completed: false,
                    };
                  // Every row carries its length and nothing else -- the set
                  // scheme and the logged count live in the logger below.
                  const summaryText =
                    milestone.kind === "prep"
                      ? `${Math.round(homeStretchingSeconds / 60)} min`
                      : milestone.kind === "warmup"
                        ? `${Math.round(warmupOnlySeconds / 60)} min`
                        : milestone.kind === "finish"
                          ? // Once finished, the marker shows the time actually
                            // spent, matching the pinned bar, not the plan.
                            `${Math.round(
                              (isHomeWorkoutCompleted && homeElapsedSeconds >= 60
                                ? homeElapsedSeconds
                                : homeTotalSeconds) / 60,
                            )} min`
                          : milestone.kind === "rest"
                            ? `${Math.round(homeRestSlotSeconds / 60)} min`
                            : `${Math.round(homeWorkoutStepSeconds / 60)} min`;
                  const primaryActionLabel = isFinishMilestone
                    ? showHomeCompletePrompt
                      ? "Hide"
                      : "Finish session"
                    : milestone.kind === "prep"
                      ? "Play guided session"
                      : milestone.kind === "warmup"
                        ? "Mark warm-up done"
                        : milestone.kind === "rest"
                          ? ""
                          : isLockedWorkout
                            ? "Finish warm-up first"
                            : "Log your set";
                  // One mark-done button at a time: warm-up's appears only once
                  // stretching is done. Stretching can be marked done by hand, so
                  // the exercises can always be unlocked without running the clock.
                  const showMilestonePrimaryAction = isHomeWorkoutCompleted
                    ? false
                    : milestone.kind === "rest"
                      ? false
                      : milestone.kind === "warmup"
                        ? isHomeStretchComplete && !isHomeWarmupComplete
                        : isActiveMilestone;
                  const handleMilestonePrimaryAction = () => {
                    if (isFinishMilestone) {
                      setShowHomeCompletePrompt((current) => !current);
                      return;
                    }

                    if (milestone.kind === "prep") {
                      handleOpenHomeSessionScreen();
                      return;
                    }

                    if (milestone.kind === "warmup") {
                      handleMarkWarmupDone();
                      return;
                    }

                    if (!exercise) {
                      return;
                    }

                    // Drafts start at a single set, so the next set has to be
                    // created before the logger can point at it.
                    const everySetLogged =
                      timelineSetDrafts.length > 0 &&
                      completedTimelineSetCount >= timelineSetDrafts.length;

                    if (everySetLogged) {
                      handleAddGymSet(exercise);
                    }

                    setHomeTimelineSetIndexByExercise((current) => ({
                      ...current,
                      [exercise.exerciseId]: everySetLogged
                        ? timelineSetDrafts.length
                        : nextTimelineSetIndex,
                    }));

                    if (!isExpanded) {
                      toggleHomeMilestone(milestone.id);
                    }
                  };
                  const cardContent = (
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "rounded-card border transition",
                          // The step you're on is the screen's main card.
                          isActiveMilestone ? "p-3.5" : "p-2.5",
                          isActiveMilestone
                            ? "glass-dark"
                            : isMilestoneDone
                              ? "border-foreground/[0.06] bg-white/25 shadow-none"
                              : "glass",
                          isLockedWorkout && !isActiveMilestone && "opacity-75",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (isFinishMilestone) {
                              // A finished session is already saved, so there's
                              // nothing to confirm; the prompt is only for ending early.
                              if (!isHomeWorkoutCompleted) {
                                setShowHomeCompletePrompt((current) => !current);
                              }
                              return;
                            }

                            toggleHomeMilestone(milestone.id);
                          }}
                          className="flex w-full items-center gap-3 text-left"
                        >
                          <span
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
                              isActiveMilestone
                                ? "border-white/35 text-brand"
                                : isMilestoneDone
                                  ? "border-foreground/10 text-primary/48"
                                  : "border-foreground/20 text-primary-strong",
                            )}
                          >
                            <MilestoneIcon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "min-w-0 truncate font-semibold tracking-[-0.03em]",
                                  isActiveMilestone ? "text-[19px]" : "text-[15px]",
                                  isActiveMilestone
                                    ? "text-white"
                                    : isMilestoneDone
                                      ? "text-foreground/42 line-through decoration-foreground/28"
                                      : "text-foreground",
                                )}
                              >
                                {milestone.title}
                              </span>
                              {isActiveMilestone ? (
                                <span className="shrink-0 rounded-full bg-mint-medium px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-foreground">
                                  Now
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={cn(
                                "mt-0.5 block truncate text-[12px] font-medium",
                                isActiveMilestone
                                  ? "text-white/58"
                                  : isMilestoneDone
                                    ? "text-foreground/38"
                                    : "text-foreground/50",
                              )}
                            >
                              {summaryText}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {isActiveMilestone ? null : isMilestoneDone && !isFinishMilestone ? (
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/12 text-primary">
                                <Check className="h-3.5 w-3.5" />
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-full border border-white/56 bg-white/56 text-foreground/50",
                                )}
                              >
                                {isFinishMilestone ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : isExpanded ? (
                                  <ChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                              </span>
                            )}
                          </span>
                        </button>

                        {showMilestonePrimaryAction ? (
                          <button
                            type="button"
                            onClick={handleMilestonePrimaryAction}
                            disabled={isLockedWorkout}
                            className={cn(
                              "mt-2.5 flex h-11 w-full items-center justify-center rounded-chip text-[14px] font-semibold tracking-[-0.02em] transition active:scale-[0.98]",
                              isLockedWorkout
                                ? "cursor-default bg-white/12 text-white/45"
                                : isActiveMilestone
                                  ? "bg-mint-medium text-foreground shadow-[0_12px_24px_rgba(92,215,185,0.24)]"
                                  : "bg-primary text-white shadow-[0_12px_24px_rgba(49,95,86,0.18)]",
                            )}
                          >
                            {primaryActionLabel}
                          </button>
                        ) : null}
                        {showMilestonePrimaryAction && milestone.kind === "prep" ? (
                          <button
                            type="button"
                            onClick={handleMarkStretchDone}
                            className={cn(
                              "mt-2 flex h-11 w-full items-center justify-center rounded-chip border text-[14px] font-semibold tracking-[-0.02em] transition active:scale-[0.98]",
                              isActiveMilestone
                                ? "border-white/35 text-white"
                                : "border-primary/30 text-primary",
                            )}
                          >
                            Mark stretching done
                          </button>
                        ) : null}
                      </div>

                      {showHomeCompletePrompt && isFinishMilestone && !isHomeWorkoutCompleted ? (
                        <div className="mt-2 glass rounded-tile px-3 py-3 text-[11px] text-foreground/58">
                          <p>End the session now and save today&apos;s workout?</p>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                saveFinishedHomeSession();
                                setShowHomeCompletePrompt(false);
                              }}
                              className="rounded-full bg-primary px-3 py-2 text-[12px] font-semibold text-white shadow-[0_10px_22px_rgba(49,95,86,0.16)] transition active:scale-[0.98]"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowHomeCompletePrompt(false)}
                              className="rounded-full border border-white/56 bg-white/56 px-3 py-2 text-[12px] font-semibold text-foreground/62 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition active:scale-[0.98]"
                            >
                              No
                            </button>
                          </div>
                        </div>
                      ) : isExpanded ? (
                        <div className="mt-2 glass rounded-tile px-3 py-3 text-[11px] text-foreground/58">
                          {milestone.kind === "prep" ? (
                            <p>Easy prep for the session.</p>
                          ) : null}
                          {milestone.kind === "warmup" ? (
                            <p>5 to 15 min ramp-up.</p>
                          ) : null}
                          {milestone.kind === "rest" ? (
                            <p>Catch your breath before the next block.</p>
                          ) : null}
                          {milestone.kind === "finish" ? (
                            <p>{`${Math.round(homeTotalSeconds / 60)} min total.`}</p>
                          ) : null}
                          {isWorkoutMilestone && exercise ? (
                            <div className="space-y-2">
                              <Link
                                href={{
                                  pathname: "/workout/exercise",
                                  query: {
                                    date: exercise.sessionDate,
                                    environment: selectedWorkoutEnvironment,
                                    sessionId: exercise.sessionId,
                                    sessionTitle: exercise.sessionTitle,
                                    exerciseId: exercise.exerciseId,
                                    exerciseName: exercise.title,
                                    exerciseType: exercise.type,
                                    reps: exercise.valueLabel,
                                    target: exercise.targetLabel,
                                    guidance: exercise.guidance,
                                    equipment: exercise.equipmentLabel,
                                  },
                                }}
                                className="inline-flex rounded-full border border-white/56 bg-white/62 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary"
                              >
                                Open
                              </Link>
                              <div className="rounded-chip border border-white/58 bg-white/48 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/58">
                                    Sets
                                  </p>
                                  <span className="rounded-full bg-primary/8 px-2 py-1 text-[10px] font-semibold text-primary">
                                    {completedTimelineSetCount}/{Math.max(timelineSetDrafts.length, 1)} logged
                                  </span>
                                </div>
                                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                  {timelineSetDrafts.map((setDraft, setIndex) => (
                                    <button
                                      key={`${exercise.exerciseId}-timeline-set-${setIndex + 1}`}
                                      type="button"
                                      onClick={() =>
                                        setHomeTimelineSetIndexByExercise((current) => ({
                                          ...current,
                                          [exercise.exerciseId]: setIndex,
                                        }))
                                      }
                                      className={cn(
                                        "flex h-8 min-w-10 items-center justify-center rounded-full border px-2 text-[11px] font-semibold transition active:scale-[0.97]",
                                        timelineSetIndex === setIndex
                                          ? "border-primary/18 bg-primary text-white"
                                          : setDraft.completed
                                            ? "border-primary/14 bg-primary/10 text-primary"
                                            : "border-foreground/8 bg-foreground/5 text-foreground/54",
                                      )}
                                    >
                                      {setIndex + 1}
                                      {setDraft.completed ? <Check className="ml-1 h-3 w-3" /> : null}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleAddGymSet(exercise);
                                      setHomeTimelineSetIndexByExercise((current) => ({
                                        ...current,
                                        [exercise.exerciseId]: timelineSetDrafts.length,
                                      }));
                                    }}
                                    className="flex h-8 min-w-10 items-center justify-center rounded-full border border-dashed border-primary/30 bg-white/42 px-2 text-primary transition active:scale-[0.97]"
                                    aria-label={`Add set for ${exercise.title}`}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <div className="rounded-chip border border-foreground/6 bg-white/56 p-2">
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground/40">
                                      Reps
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setGymRepsPicker({
                                          exerciseId: exercise.exerciseId,
                                          setIndex: timelineSetIndex,
                                          value: timelineSetDraft.reps,
                                          source: "home",
                                        })
                                      }
                                      className="mt-1.5 flex h-10 w-full items-center justify-center rounded-full border border-foreground/8 bg-white text-center transition active:scale-[0.97]"
                                      aria-label={`${exercise.title} set ${timelineSetIndex + 1} change reps`}
                                    >
                                      <span className="text-[18px] font-semibold tracking-[-0.04em]">
                                        {timelineSetDraft.reps}
                                      </span>
                                    </button>
                                  </div>
                                  <div className="rounded-chip border border-foreground/6 bg-white/56 p-2">
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground/40">
                                      Load
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setGymWeightPicker({
                                          exerciseId: exercise.exerciseId,
                                          setIndex: timelineSetIndex,
                                          value: timelineSetDraft.load,
                                          source: "home",
                                        })
                                      }
                                      className="mt-1.5 flex h-10 w-full items-center justify-center rounded-full border border-foreground/8 bg-white text-center transition active:scale-[0.97]"
                                      aria-label={`${exercise.title} set ${timelineSetIndex + 1} change load`}
                                    >
                                      <span className="text-[18px] font-semibold tracking-[-0.04em]">
                                        {formatLoadValue(timelineSetDraft.load)}
                                      </span>
                                    </button>
                                    <p className="mt-0.5 text-center text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground/34">
                                      kg
                                    </p>
                                  </div>
                                </div>
                                <div className={cn("mt-2 grid gap-2", isPro ? "grid-cols-[40px_1fr]" : "grid-cols-1")}>
                                  {isPro ? (
                                    <button
                                      type="button"
                                      onClick={() => handleVoiceGymSet(exercise)}
                                      className={cn(
                                        "flex h-10 items-center justify-center rounded-full border transition active:scale-[0.96]",
                                        voiceGymSetExerciseId === exercise.exerciseId
                                          ? "border-primary/18 bg-primary text-white"
                                          : "border-primary/14 bg-primary/8 text-primary",
                                      )}
                                      aria-label={`Log ${exercise.title} set by voice`}
                                    >
                                      <Mic className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => markHomeSetDone(exercise, timelineSetIndex)}
                                    className={cn(
                                      "flex h-10 items-center justify-center rounded-full px-3 text-[12px] font-semibold shadow-[0_10px_20px_rgba(49,95,86,0.18)] transition active:scale-[0.98]",
                                      timelineSetDraft.completed
                                        ? "bg-primary/12 text-primary"
                                        : "bg-primary text-white",
                                    )}
                                  >
                                    {timelineSetDraft.completed ? "Set added!" : "Mark set done"}
                                  </button>
                                </div>
                                {voiceGymSetExerciseId === exercise.exerciseId && voiceGymSetTranscript ? (
                                  <p className="mt-2 text-center text-[11px] font-medium text-foreground/54">
                                    {voiceGymSetTranscript}
                                  </p>
                                ) : voiceGymSetError ? (
                                  <VoiceErrorNote
                                    message={voiceGymSetError}
                                    className="mt-2 text-center text-[11px] font-medium text-[#9f3a2f]"
                                  />
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );

                  return (
                    <div key={milestone.id} className="contents">
                      <div className="relative z-[1] col-start-1 flex justify-center pt-3.5">
                        <span
                          className={cn(
                            "flex items-center justify-center rounded-full text-[12px] font-semibold transition",
                            isActiveMilestone
                              ? "glass-dark h-9 w-9 text-brand"
                              : isMilestoneDone
                                ? "h-9 w-9 border border-white/30 bg-forest/75 text-white backdrop-blur-xl"
                                : "glass h-9 w-9 text-foreground/50",
                          )}
                        >
                          {isMilestoneDone ? (
                            <Check className="h-4 w-4" />
                          ) : isActiveMilestone ? (
                            <Play className="h-3.5 w-3.5 fill-current" />
                          ) : isNumberedMilestone ? (
                            milestoneStepNumber
                          ) : milestone.kind === "rest" ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Flag className="h-3.5 w-3.5" />
                          )}
                        </span>
                      </div>

                      <div className="col-start-2 min-w-0">{cardContent}</div>
                    </div>
                  );
                })}
              </div>
            </div>


            {renderSetValuePickers()}
            </>
          ) : (
            <>
              {sessionNote ? (
                <p className="text-sm leading-5 text-foreground/62">{sessionNote}</p>
              ) : null}

              <div
                className={cn(
                  "grid gap-2.5",
                  selectedWorkoutEnvironment === "gym" ? "grid-cols-1" : "grid-cols-2",
                  sessionNote ? "mt-4" : "mt-0",
                )}
              >
                {allWorkoutCards.map((exercise) => {
                  const isDone =
                    selectedWorkoutEnvironment === "gym"
                      ? isGymExerciseLogged(exercise)
                      : state.workoutLogs.some(
                          (log) =>
                            log.sessionDate === exercise.sessionDate &&
                            log.sessionId === exercise.sessionId &&
                            log.exercisesCompleted.includes(exercise.exerciseId),
                        );
                  const isExpanded = expandedGymExerciseId === exercise.exerciseId;
                  const setDrafts = getGymSetDrafts(exercise);

                  return (
                    <div
                      key={exercise.exerciseId}
                      id={`gym-exercise-${exercise.exerciseId}`}
                      className={cn(
                        "glass group relative overflow-visible rounded-card px-3 py-2.5 transition",
                        isDone && "opacity-60",
                      )}
                      >
                      <div className="relative z-[1]">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleGymCard(exercise)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            aria-expanded={isExpanded}
                          >
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-foreground/20"
                            >
                              <exercise.icon className="h-5 w-5 text-primary-strong" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="min-w-0 text-[15px] font-semibold tracking-[-0.03em] text-foreground">
                                <span className="line-clamp-1 leading-[1.2]">{exercise.title}</span>
                              </div>
                            </div>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-foreground/42 transition",
                                isExpanded && "rotate-180",
                              )}
                            />
                          </button>

                          {selectedWorkoutEnvironment === "gym" ? (
                            <>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(event) => {
                                  const nextExerciseId =
                                    openGymMenuExerciseId === exercise.exerciseId
                                      ? null
                                      : exercise.exerciseId;

                                  if (!nextExerciseId) {
                                    setOpenGymMenuExerciseId(null);
                                    setGymMenuAnchor(null);
                                    return;
                                  }

                                  const rect = event.currentTarget.getBoundingClientRect();
                                  const menuWidth = 176;
                                  const viewportWidth = window.innerWidth;
                                  const availableBelow = window.innerHeight - rect.bottom;
                                  const left = Math.min(
                                    Math.max(12, rect.right - menuWidth),
                                    viewportWidth - menuWidth - 12,
                                  );
                                  const top =
                                    availableBelow < 140 ? rect.top - 132 : rect.bottom + 8;

                                  setOpenGymMenuExerciseId(nextExerciseId);
                                  setGymMenuAnchor({
                                    exerciseId: nextExerciseId,
                                    top: Math.max(12, top),
                                    left,
                                  });
                                }}
                                className="glass-inset flex h-9 w-9 items-center justify-center rounded-full text-foreground/56 transition active:scale-[0.96]"
                                aria-label={`${exercise.title} options`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </div>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="relative z-[1] mt-3 overflow-hidden rounded-tile border border-white/42 bg-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.46)]">
                          {isPro ? (
                            <div className="border-b border-foreground/6 px-2 py-2">
                              <button
                                type="button"
                                onClick={() => handleVoiceGymSet(exercise)}
                                className={cn(
                                  "flex w-full items-center justify-center gap-2 rounded-chip border px-3 py-2 text-[12px] font-semibold transition active:scale-[0.98]",
                                  voiceGymSetExerciseId === exercise.exerciseId
                                    ? "border-primary/18 bg-primary text-white shadow-[0_10px_22px_rgba(49,95,86,0.16)]"
                                    : "border-white/54 bg-white/46 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.62)]",
                                )}
                                aria-label={`${voiceGymSetExerciseId === exercise.exerciseId ? "Stop" : "Start"} voice set logging for ${exercise.title}`}
                              >
                                <Mic className="h-4 w-4" />
                                {voiceGymSetExerciseId === exercise.exerciseId
                                  ? "Listening..."
                                  : "Log set by voice"}
                              </button>
                              {voiceGymSetExerciseId === exercise.exerciseId && voiceGymSetTranscript ? (
                                <p className="mt-1 text-center text-[11px] font-medium text-foreground/54">
                                  {voiceGymSetTranscript}
                                </p>
                              ) : null}
                              {voiceGymSetError && voiceGymSetExerciseId !== exercise.exerciseId ? (
                                <VoiceErrorNote
                                  message={voiceGymSetError}
                                  className="mt-1 text-center text-[11px] font-medium text-[#9f3a2f]"
                                />
                              ) : null}
                            </div>
                          ) : null}
                          <div className="grid grid-cols-[44px_1fr_72px_72px_38px] items-center border-b border-foreground/6 px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/42">
                            <span>Set</span>
                            <span>Previous</span>
                            <span className="text-center">Kg</span>
                            <span className="text-center">Reps</span>
                            <span />
                          </div>

                          {setDrafts.map((setDraft, setIndex) => {
                            const priorLogs = state.workoutLoadLogs.filter(
                              (log) =>
                                log.exerciseId === exercise.exerciseId &&
                                log.sessionDate < exercise.sessionDate,
                            );
                            const latestPriorDate = priorLogs.reduce<string | null>(
                              (latest, log) =>
                                !latest || log.sessionDate > latest ? log.sessionDate : latest,
                              null,
                            );
                            const loggedSet = latestPriorDate
                              ? priorLogs.find(
                                  (log) =>
                                    log.sessionDate === latestPriorDate &&
                                    log.setNumber === setIndex + 1,
                                )
                              : undefined;

                            return (
                              <div
                                key={`${exercise.exerciseId}-set-${setIndex + 1}`}
                                className={cn(
                                  "grid grid-cols-[44px_1fr_72px_72px_38px] items-center px-2 py-2.5 text-[13px] font-semibold text-foreground",
                                  setIndex > 0 && "border-t border-foreground/5",
                                  setDraft.completed && "bg-primary/10",
                                )}
                              >
                                <span>{setIndex + 1}</span>
                                <span className="text-[12px] font-medium text-foreground/46">
                                  {loggedSet ? `${formatLoadValue(loggedSet.loadValue)} kg x ${loggedSet.reps ?? "-"}` : "-"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGymWeightPicker({
                                      exerciseId: exercise.exerciseId,
                                      setIndex,
                                      value: setDraft.load,
                                    })
                                  }
                                  className={cn(
                                    "mx-auto flex h-9 w-16 items-center justify-center gap-1 rounded-full border border-white/58 bg-white/62 text-center text-[13px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition active:scale-[0.97]",
                                    (setDraft.touched ?? true) ? "text-foreground" : "text-foreground/38",
                                  )}
                                  aria-label={`${exercise.title} set ${setIndex + 1} change weight`}
                                >
                                  {(setDraft.touched ?? true) ? formatLoadValue(setDraft.load) : "-"}
                                  <ChevronDown className="h-3 w-3 opacity-60" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGymRepsPicker({
                                      exerciseId: exercise.exerciseId,
                                      setIndex,
                                      value: setDraft.reps,
                                    })
                                  }
                                  className={cn(
                                    "mx-auto flex h-9 w-16 items-center justify-center gap-1 rounded-full border border-white/58 bg-white/62 text-center text-[13px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition active:scale-[0.97]",
                                    (setDraft.touched ?? true) ? "text-foreground" : "text-foreground/38",
                                  )}
                                  aria-label={`${exercise.title} set ${setIndex + 1} change reps`}
                                >
                                  {(setDraft.touched ?? true) ? setDraft.reps : "-"}
                                  <ChevronDown className="h-3 w-3 opacity-60" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteGymSet(exercise, setIndex)}
                                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/58 bg-white/58 text-foreground/38 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:text-[#9f3a2f] active:scale-[0.96]"
                                  aria-label={`Remove ${exercise.title} set ${setIndex + 1}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => handleAddGymSet(exercise)}
                            className="flex w-full items-center justify-center gap-2 border-t border-foreground/6 bg-transparent px-3 py-3 text-[13px] font-semibold text-foreground transition active:scale-[0.99]"
                          >
                            <Plus className="h-4 w-4" />
                            Add set
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {selectedWorkoutEnvironment === "gym" ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowGymWorkoutPicker((current) => !current)}
                    className={cn(
                      "group flex min-h-[88px] w-full items-center justify-center gap-3 rounded-card border border-dashed px-4 py-4 text-[14px] font-semibold transition active:scale-[0.98]",
                      showGymWorkoutPicker
                        ? "border-primary/36 bg-primary/8 text-primary shadow-[0_14px_28px_rgba(49,95,86,0.08)]"
                        : "border-foreground/18 bg-white/34 text-foreground/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] hover:bg-white/48 hover:text-foreground",
                    )}
                    aria-expanded={showGymWorkoutPicker}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full border transition",
                        showGymWorkoutPicker
                          ? "border-primary/20 bg-primary text-white"
                          : "border-white/58 bg-white/58 text-primary group-hover:bg-white/78",
                      )}
                    >
                      <Plus className="h-5 w-5" />
                    </span>
                    Add workout
                  </button>

                  {showGymWorkoutPicker ? (
                    <div className="mt-3 glass rounded-card px-3.5 py-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/42">
                            {activeCustomRoutine ? "Exercise" : muscleFocusLabel} options
                          </p>
                          <p className="mt-1 text-[15px] font-semibold tracking-[-0.03em] text-foreground">
                            {activeCustomRoutine ? "Add to routine" : "Add to today"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowGymWorkoutPicker(false)}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/56 bg-white/58 text-foreground/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition active:scale-[0.96]"
                          aria-label="Close add workout list"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {addableGymWorkouts.length > 0 ? (
                          addableGymWorkouts.map((exercise) => (
                            <div
                              key={exercise.exerciseId}
                              className="flex items-center justify-between gap-3 glass rounded-tile px-3 py-3"
                            >
                              <div className="min-w-0">
                                <p className="text-[14px] font-semibold tracking-[-0.03em] text-foreground">
                                  {exercise.title}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddGymWorkout(exercise)}
                                className="shrink-0 rounded-full bg-primary-strong px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_10px_22px_rgba(17,23,15,0.16)] transition active:scale-[0.98]"
                              >
                                Add
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-tile border border-white/56 bg-white/56 px-3 py-3 text-[12px] font-medium text-foreground/54 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                            {activeCustomRoutine
                              ? "All available workouts are already in your routine."
                              : `All available ${muscleFocusLabel.toLowerCase()} workouts are already in today's routine.`}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 rounded-tile border border-white/56 bg-white/58 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/42">
                              Add your own workout
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="text"
                            value={customGymWorkoutName}
                            onChange={(event) => setCustomGymWorkoutName(event.target.value)}
                            placeholder="Type your workout name"
                            className="h-11 min-w-0 flex-1 rounded-chip border border-white/62 bg-white/74 px-3 text-[14px] font-medium text-foreground outline-none placeholder:text-foreground/36 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]"
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomGymWorkout}
                            className="shrink-0 rounded-full bg-primary-strong px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_10px_22px_rgba(17,23,15,0.16)] transition active:scale-[0.98]"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedWorkoutEnvironment === "gym" && !activeCustomRoutine ? (
                <div className="mt-4">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-[13px] font-semibold transition active:scale-[0.98]",
                      isSavedGymRoutineCurrent
                        ? "border border-white/56 bg-white/56 text-foreground/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_10px_20px_rgba(69,88,47,0.08)]"
                        : environmentTheme.primaryButton,
                    )}
                    onClick={handleSaveGymRoutine}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full",
                        isSavedGymRoutineCurrent
                          ? "bg-black/8 text-foreground/72"
                          : "bg-white/14 text-brand",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {isSavedGymRoutineCurrent ? "Routine saved" : "Save my routine"}
                  </button>
                </div>
              ) : null}

              {openGymMenuExercise && gymMenuAnchor ? (
                <>
                  <button
                    type="button"
                    aria-label="Close workout actions"
                    onClick={() => {
                      setOpenGymMenuExerciseId(null);
                      setGymMenuAnchor(null);
                    }}
                    className="fixed inset-0 z-30 cursor-default bg-transparent"
                  />
                  <div
                    className="glass-sheet glass-ui fixed z-40 w-44 overflow-hidden rounded-[20px] p-1.5"
                    style={{
                      top: gymMenuAnchor.top,
                      left: gymMenuAnchor.left,
                    }}
                  >
                    <Link
                      href={{
                        pathname: "/workout/history",
                        query: {
                          date: openGymMenuExercise.sessionDate,
                          environment: selectedWorkoutEnvironment,
                          sessionId: openGymMenuExercise.sessionId,
                          sessionTitle: openGymMenuExercise.sessionTitle,
                          exerciseId: openGymMenuExercise.exerciseId,
                          exerciseName: openGymMenuExercise.title,
                          reps: openGymMenuExercise.valueLabel,
                          target: openGymMenuExercise.targetLabel,
                          guidance: openGymMenuExercise.guidance,
                          equipment: openGymMenuExercise.equipmentLabel,
                        },
                      }}
                      onClick={() => {
                        setOpenGymMenuExerciseId(null);
                        setGymMenuAnchor(null);
                      }}
                      className="flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-[14px] font-medium leading-none text-foreground transition hover:bg-foreground/5"
                    >
                      <History className="h-4 w-4 text-foreground/50" />
                      History
                    </Link>
                    <Link
                      href={{
                        pathname: "/workout/exercise",
                        query: {
                          date: openGymMenuExercise.sessionDate,
                          environment: selectedWorkoutEnvironment,
                          sessionId: openGymMenuExercise.sessionId,
                          sessionTitle: openGymMenuExercise.sessionTitle,
                          exerciseId: openGymMenuExercise.exerciseId,
                          exerciseName: openGymMenuExercise.title,
                          exerciseType: openGymMenuExercise.type,
                          reps: openGymMenuExercise.valueLabel,
                          target: openGymMenuExercise.targetLabel,
                          guidance: openGymMenuExercise.guidance,
                          equipment: openGymMenuExercise.equipmentLabel,
                        },
                      }}
                      onClick={() => {
                        setOpenGymMenuExerciseId(null);
                        setGymMenuAnchor(null);
                      }}
                      className="flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-[14px] font-medium leading-none text-foreground transition hover:bg-foreground/5"
                    >
                      <Video className="h-4 w-4 text-foreground/50" />
                      How to do
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleRemoveGymWorkout(openGymMenuExercise.exerciseId)}
                      className="flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left text-[14px] font-medium leading-none text-[#7b1d1d] transition hover:bg-[#7b1d1d]/5"
                    >
                      <Trash2 className="h-4 w-4 text-[#7b1d1d]/72" />
                      Remove
                    </button>
                  </div>
                </>
              ) : null}

              {renderSetValuePickers()}
            </>
          )}
        </div>
          </>
        )}
        </>
        )}
        </div>

        {showCustomizeNamePrompt ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5 backdrop-blur-sm">
            <div className="glass-sheet glass-ui w-full max-w-[360px] rounded-hero p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-medium text-foreground/55">
                    Custom workout
                  </p>
                  <h3 className="mt-1 text-[19px] font-medium tracking-[-0.02em] text-foreground">
                    {customizeNamePromptMode === "start" ? "Save your routine" : "Name your routine"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomizeNamePrompt(false)}
                  className="glass-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/58 transition active:scale-[0.95]"
                  aria-label="Cancel naming routine"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                type="text"
                autoFocus
                value={customizeNameDraft}
                onChange={(event) => setCustomizeNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleConfirmCustomizeName();
                  }
                }}
                placeholder="e.g. Push day, Leg burner"
                maxLength={40}
                className="glass-inset mt-4 h-12 w-full rounded-chip px-3.5 text-[15px] font-medium text-foreground outline-none placeholder:text-foreground/36 focus:border-primary/40"
              />
              <button
                type="button"
                onClick={handleConfirmCustomizeName}
                className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-primary-strong px-4 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(12,39,35,0.22)] transition active:scale-[0.97]"
              >
                {customizeNamePromptMode === "start" ? "Save & start" : "Continue"}
              </button>
            </div>
          </div>
        ) : null}

        {lockedEnvironmentPrompt ? (
          (() => {
            // Two different reasons the toggle can lock: Starter tier (Home is
            // a Pro feature) or a setup mismatch (Pro user picked Gym at
            // onboarding and now tapped Home, or vice versa). Each gets its
            // own copy and CTA so the user knows where to go next.
            const isTierLock = !isPro && lockedEnvironmentPrompt === "home";
            const title = isTierLock
              ? "Home workouts are Pro"
              : `${lockedEnvironmentPrompt === "home" ? "Home" : "Gym"} workouts locked`;
            const blurb = isTierLock
              ? "Upgrade to Pro for guided home sessions tailored to your goal."
              : "Unlock this once you've changed your workout setup.";
            const ctaLabel = isTierLock ? "See Pro plans" : "Change workout setup";
            const ctaHref = isTierLock
              ? "/paywall?upgrade=1&feature=home-workouts&return=/workout"
              : "/profile";
            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5 backdrop-blur-sm"
                onClick={() => setLockedEnvironmentPrompt(null)}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label={title}
                  onClick={(event) => event.stopPropagation()}
                  className="glass-sheet glass-ui w-full max-w-[360px] rounded-hero p-5 text-center"
                >
                  <IconBadge className="mx-auto h-11 w-11 text-foreground">
                    <Lock className="h-4.5 w-4.5" />
                  </IconBadge>
                  <h3 className="mt-3 text-[19px] font-medium tracking-[-0.02em] text-foreground">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-[14px] leading-[1.5] text-foreground/58">
                    {blurb}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setLockedEnvironmentPrompt(null);
                      router.push(ctaHref);
                    }}
                    className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-primary-strong px-4 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(12,39,35,0.22)] transition active:scale-[0.97]"
                  >
                    {ctaLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLockedEnvironmentPrompt(null)}
                    className="mt-2 w-full rounded-full px-4 py-2.5 text-[13px] font-semibold text-foreground/52 transition active:scale-[0.98]"
                  >
                    Not now
                  </button>
                </div>
              </div>
            );
          })()
        ) : null}

        {showCustomizeLibrary ? (
          (() => {
            const customizeRoutine = draftGymRoutinesByDate[selectedDate] ?? [];
            const addedKeys = new Set(
              (finisherMuscleLabel ? customGymWorkoutsForDate : customizeRoutine).flatMap(
                (exercise) => [exercise.exerciseId, exercise.title.toLowerCase()],
              ),
            );
            const searchTerm = customizeLibrarySearch.trim().toLowerCase();
            const filteredItems = customizeLibraryItems.filter((item) => {
              if (!searchTerm) {
                return true;
              }

              return (
                item.title.toLowerCase().includes(searchTerm) ||
                item.muscle.toLowerCase().includes(searchTerm) ||
                item.target.toLowerCase().includes(searchTerm) ||
                item.equipment.toLowerCase().includes(searchTerm)
              );
            });

            return (
              <div className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-sm">
                <div className="glass-sheet glass-ui mt-auto flex max-h-[88vh] flex-col rounded-t-[28px]">
                  <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
                    <div>
                      <p className="text-[12px] font-medium text-foreground/55">
                        Exercise library
                      </p>
                      <h3 className="mt-1 text-[19px] font-medium tracking-[-0.02em] text-foreground">
                        {finisherMuscleLabel
                          ? `Add a ${finisherMuscleLabel.toLowerCase()} finisher`
                          : "Pick your exercises"}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFinisherMuscleLabel(null);
                        setShowCustomizeLibrary(false);
                      }}
                      className="glass-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/58 transition active:scale-[0.95]"
                      aria-label="Close exercise library"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="px-5 pb-3">
                    <input
                      type="text"
                      value={customizeLibrarySearch}
                      onChange={(event) => setCustomizeLibrarySearch(event.target.value)}
                      placeholder="Search exercises or muscle"
                      className="glass-inset h-11 w-full rounded-chip px-3.5 text-[14px] font-medium text-foreground outline-none placeholder:text-foreground/36 focus:border-primary/40"
                    />
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
                    {customizeLibraryLoading ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/24 border-t-primary" />
                        <p className="text-[13px] font-medium text-foreground/52">
                          Loading exercises…
                        </p>
                      </div>
                    ) : customizeLibraryError ? (
                      <div className="flex flex-col items-center gap-3 py-14 text-center">
                        <p className="text-[13px] font-medium text-foreground/56">
                          {customizeLibraryError}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomizeLibraryFetched(false);
                            setCustomizeLibraryError(null);
                            void fetchCustomizeLibrary();
                          }}
                          className="glass-inset rounded-full px-4 py-2 text-[13px] font-semibold text-primary transition active:scale-[0.97]"
                        >
                          Retry
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="pb-2 text-[12px] font-medium text-foreground/44">
                          {filteredItems.length} of {customizeLibraryItems.length} exercises
                        </p>
                        <div className="flex flex-col gap-2">
                          {filteredItems.map((item) => {
                            const isAdded =
                              addedKeys.has(item.exerciseId) ||
                              addedKeys.has(item.title.toLowerCase());

                            return (
                              <div
                                key={item.exerciseId}
                                className="glass-inset flex items-center justify-between gap-3 rounded-tile px-3 py-3"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-foreground">
                                    {item.title}
                                  </p>
                                  <p className="mt-0.5 truncate text-[12px] font-medium text-foreground/48">
                                    {getMuscleFocusLabel(item.muscle)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  disabled={isAdded}
                                  onClick={() =>
                                    finisherMuscleLabel
                                      ? handleAddFinisherWorkout(item)
                                      : handleAddCustomizeWorkout(item)
                                  }
                                  className={cn(
                                    "flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-[12px] font-semibold shadow-[0_10px_22px_rgba(17,23,15,0.14)] transition active:scale-[0.98]",
                                    isAdded
                                      ? "cursor-default bg-primary/12 text-primary shadow-none"
                                      : "bg-primary-strong text-white",
                                  )}
                                >
                                  {isAdded ? (
                                    <>
                                      <Check className="h-3.5 w-3.5" />
                                      Added
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="h-3.5 w-3.5" />
                                      Add
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                          {filteredItems.length === 0 ? (
                            <div className="glass-inset rounded-tile px-3 py-6 text-center text-[13px] font-medium text-foreground/52">
                              No exercises match “{customizeLibrarySearch.trim()}”.
                            </div>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="border-t border-foreground/8 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setFinisherMuscleLabel(null);
                        setShowCustomizeLibrary(false);
                      }}
                      className="flex h-11 w-full items-center justify-center rounded-full bg-primary-strong px-4 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(12,39,35,0.22)] transition active:scale-[0.97]"
                    >
                      {finisherMuscleLabel ? (
                        "Close"
                      ) : (
                        <>
                          Done · {customizeRoutine.length}{" "}
                          {customizeRoutine.length === 1 ? "exercise" : "exercises"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()
        ) : null}

        {showFocusChangeWarning && pendingFocusChange ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-8">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => { setShowFocusChangeWarning(false); setPendingFocusChange(null); }}
            />
            <div className="glass-sheet glass-ui relative w-full max-w-sm rounded-hero p-5">
              <h3 className="text-[19px] font-medium tracking-[-0.02em] text-foreground">Change today&apos;s focus?</h3>
              <p className="mt-2 text-[14px] leading-[1.5] text-foreground/60">
                {selectedWorkoutEnvironment === "home"
                  ? "Your home workout session is in progress. Switching focus will change your exercises but won't reset your timer."
                  : "You've already logged sets for today. Switching focus will change your exercise list, but logged sets won't be deleted."}
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowFocusChangeWarning(false); setPendingFocusChange(null); }}
                  className="flex h-11 flex-1 items-center justify-center rounded-full border border-foreground/12 bg-white text-[13.5px] font-semibold text-foreground/70 transition active:scale-[0.97]"
                >
                  Keep current
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingFocusChange) applyMuscleFocusChange(pendingFocusChange);
                    setShowFocusChangeWarning(false);
                    setPendingFocusChange(null);
                  }}
                  className="flex h-11 flex-1 items-center justify-center rounded-full bg-primary-strong text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(12,39,35,0.22)] transition active:scale-[0.97]"
                >
                  Switch focus
                </button>
              </div>
            </div>
          </div>
        ) : null}

      </section>
    </div>
  );
}

export default function WorkoutPage() {
  return (
    <Suspense fallback={null}>
      <WorkoutPageContent />
    </Suspense>
  );
}
