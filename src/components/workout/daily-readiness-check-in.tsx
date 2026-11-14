"use client";

import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { Activity, Battery, Bed } from "lucide-react";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { getReadinessForDate } from "@/lib/readiness";
import { cn, startOfTodayIso } from "@/lib/utils";
import { AdaptiveSessionActivated } from "@/components/workout/adaptive-session-activated";

// Offered as a shortcut for anyone who does not want to answer: pick how long
// you have today and the session is built to fit it. Each option carries a
// short hint so the chips read as a decision, not just four numbers.
const SESSION_MINUTE_OPTIONS: Array<{ minutes: number; hint: string }> = [
  { minutes: 20, hint: "Quick" },
  { minutes: 30, hint: "Short" },
  { minutes: 45, hint: "Standard" },
  { minutes: 60, hint: "Full" },
];

type SliderFieldProps = {
  icon: ElementType;
  label: string;
  leftLabel: string;
  max: number;
  min: number;
  rightLabel: string;
  step?: number;
  unit?: string;
  value: number;
  onChange: (value: number) => void;
};

function SliderField({
  icon: Icon,
  label,
  leftLabel,
  max,
  min,
  rightLabel,
  step = 1,
  unit,
  value,
  onChange,
}: SliderFieldProps) {
  const fillPct = ((value - min) / (max - min)) * 100;

  return (
    <label className="glass-inset block rounded-tile p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5 text-[13.5px] font-medium text-foreground">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-primary-strong/8 text-primary-strong">
            <Icon className="h-4 w-4" />
          </span>
          {label}
        </span>
        <span className="shrink-0 rounded-full bg-primary-strong/8 px-3 py-1 text-[13px] font-medium tabular-nums text-primary-strong">
          {value}
          {unit}
        </span>
      </div>

      {/* Custom track: a filled bar + native input overlaid transparent. */}
      <div className="relative mt-4 flex h-6 items-center">
        <span className="absolute inset-x-0 h-2 rounded-full bg-foreground/8" />
        <span
          className="absolute left-0 h-2 rounded-full bg-primary-strong"
          style={{ width: `${fillPct}%` }}
        />
        <input
          className={cn(
            "relative h-6 w-full cursor-pointer appearance-none bg-transparent",
            "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary-strong [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(12,39,35,0.3)]",
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary-strong [&::-moz-range-thumb]:bg-white",
          )}
          max={max}
          min={min}
          step={step}
          type="range"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>

      <div className="mt-1.5 flex justify-between gap-4 text-[12px] font-medium text-foreground/55">
        <span>{leftLabel}</span>
        <span className="text-right">{rightLabel}</span>
      </div>
    </label>
  );
}

type ReadinessOpenDetail = {
  /** Fired after the sheet closes via Skip / Submit / Pick-minutes so the
   * caller's original intent (usually "start the home session") resumes
   * instead of forcing another tap. */
  onResume?: () => void;
};

export function DailyReadinessCheckIn() {
  const {
    state: { readinessLogs, workoutPreferences },
    logDailyReadiness,
    updateWorkoutPreferences,
  } = useDietFit();
  const today = startOfTodayIso();
  const todayReadiness = getReadinessForDate(readinessLogs, today);
  const pickedSessionMinutes = workoutPreferences?.homeSessionMinutesByDate?.[today] ?? null;
  const dismissedToday = Boolean(
    workoutPreferences?.dailyReadinessDismissedByDate?.[today],
  );
  const [forceOpen, setForceOpen] = useState(false);
  const [sleepHours, setSleepHours] = useState(7);
  const [energyLevel, setEnergyLevel] = useState(6);
  const [muscleSoreness, setMuscleSoreness] = useState(3);
  const [resumeAction, setResumeAction] = useState<(() => void) | null>(null);
  // When true, the takeover has fully replaced the sheet UI. It sits in front
  // of the workout for 3s, then calls back to resume the tap that opened the
  // sheet in the first place.
  const [showActivated, setShowActivated] = useState(false);

  useEffect(() => {
    const openReadiness = (event: Event) => {
      const detail = (event as CustomEvent<ReadinessOpenDetail>).detail;
      // Wrap in an outer function so React's setState treats the callback
      // as the value to store, not as a state updater.
      setResumeAction(() => detail?.onResume ?? null);
      setForceOpen(true);
    };

    window.addEventListener("dietfit-open-readiness-check-in", openReadiness);

    return () => {
      window.removeEventListener("dietfit-open-readiness-check-in", openReadiness);
    };
  }, []);

  const open = !todayReadiness && !dismissedToday && forceOpen;

  const markDismissedForToday = () => {
    updateWorkoutPreferences((preferences) => ({
      ...preferences,
      dailyReadinessDismissedByDate: {
        ...preferences.dailyReadinessDismissedByDate,
        [today]: true,
      },
    }));
  };

  // Every dismissal path fires the resume callback so the tap that opened
  // the sheet (usually Play on the home session) carries through instead of
  // being dropped on the floor.
  const closeAndResume = () => {
    const action = resumeAction;
    setResumeAction(null);
    setForceOpen(false);
    action?.();
  };

  const handleSkip = () => {
    markDismissedForToday();
    closeAndResume();
  };

  const handleSubmit = () => {
    logDailyReadiness({
      sleepHours,
      energyLevel,
      muscleSoreness,
    });
    markDismissedForToday();
    // Swap the sheet for the 3-second AI-adaptive takeover. The resume
    // callback fires only after the takeover finishes so the user sees the
    // reveal before the workout screen returns.
    setForceOpen(false);
    setShowActivated(true);
  };

  const handleActivatedDismiss = () => {
    setShowActivated(false);
    closeAndResume();
  };

  // Picking a length answers the check-in on its own: the session is built to
  // fit the time instead of to a readiness score.
  const handlePickMinutes = (minutes: number) => {
    updateWorkoutPreferences((preferences) => ({
      ...preferences,
      homeSessionMinutesByDate: {
        ...preferences.homeSessionMinutesByDate,
        [today]: minutes,
      },
      dailyReadinessDismissedByDate: {
        ...preferences.dailyReadinessDismissedByDate,
        [today]: true,
      },
    }));
    closeAndResume();
  };

  // The activated takeover overrides every other guard. Submit sets
  // showActivated + clears forceOpen; the sheet unmounts, the takeover paints
  // for 3s, then handleActivatedDismiss runs the resume callback.
  if (showActivated) {
    return <AdaptiveSessionActivated onComplete={handleActivatedDismiss} />;
  }

  if (!open || todayReadiness || dismissedToday) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center md:p-6">
      <div
        className={cn(
          "animate-sheet-up glass-sheet glass-ui flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-[28px] md:rounded-hero",
        )}
      >
        <div className="shrink-0 px-5 pb-3 pt-3">
          <div className="mx-auto h-1.5 w-11 rounded-full bg-foreground/14" />
          <h2 className="mt-4 text-center text-[19px] font-medium tracking-[-0.02em] text-foreground">
            AI adaptive session
          </h2>
          <p className="mt-1 text-center text-[12.5px] leading-[1.4] text-foreground/58">
            Pick a length, or tune today&apos;s sets to how you feel.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          <p className="mb-2.5 text-center text-[12.5px] font-medium text-foreground/70">
            How long do you have today?
          </p>
          <div className="grid grid-cols-4 gap-2.5">
            {SESSION_MINUTE_OPTIONS.map(({ minutes, hint }) => {
              const isSelected = pickedSessionMinutes === minutes;
              return (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => handlePickMinutes(minutes)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex h-[76px] flex-col items-center justify-center gap-1 rounded-tile text-center transition active:scale-[0.97]",
                    isSelected
                      ? "bg-primary-strong text-white shadow-[0_12px_26px_rgba(12,39,35,0.26)]"
                      : "border border-primary-strong/18 bg-primary-strong/10 text-foreground hover:bg-primary-strong/14",
                  )}
                >
                  <span className="flex items-baseline gap-0.5 leading-none">
                    <span className="text-[24px] font-semibold tracking-[-0.02em] tabular-nums">
                      {minutes}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        isSelected ? "text-white/80" : "text-foreground/55",
                      )}
                    >
                      min
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-medium leading-none",
                      isSelected ? "text-white/75" : "text-primary-strong/70",
                    )}
                  >
                    {hint}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-foreground/8" />
            <span className="text-[12px] font-medium text-foreground/55">
              Or tune to how you feel
            </span>
            <span className="h-px flex-1 bg-foreground/8" />
          </div>

          <div className="grid gap-3">
            <SliderField
              icon={Bed}
              label="How many hours did you sleep last night?"
              leftLabel="0h"
              max={12}
              min={0}
              rightLabel="12h+"
              step={0.5}
              unit="h"
              value={sleepHours}
              onChange={setSleepHours}
            />
            <SliderField
              icon={Battery}
              label="How energetic do you feel right now?"
              leftLabel="Drained"
              max={10}
              min={1}
              rightLabel="Excellent"
              value={energyLevel}
              onChange={setEnergyLevel}
            />
            <SliderField
              icon={Activity}
              label="How sore are your muscles today?"
              leftLabel="Fresh"
              max={10}
              min={1}
              rightLabel="Very sore"
              value={muscleSoreness}
              onChange={setMuscleSoreness}
            />
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-[0.8fr_1.2fr] gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={handleSkip}
            className="flex h-11 items-center justify-center rounded-full border border-foreground/12 bg-white text-[13.5px] font-semibold text-foreground/70 transition active:scale-[0.97]"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex h-11 items-center justify-center rounded-full bg-primary-strong text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(12,39,35,0.22)] transition active:scale-[0.97]"
          >
            Update today&apos;s plan
          </button>
        </div>
      </div>
    </div>
  );
}
