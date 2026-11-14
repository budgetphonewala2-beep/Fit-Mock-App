"use client";

import { useMemo, useState } from "react";
import type { ElementType } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  Dumbbell,
  Flame,
  HeartCrack,
  MessageCircleHeart,
  Salad,
  Scale,
  Sparkles,
  Trophy,
  Utensils,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDietFit } from "@/components/providers/dietfit-provider";
import {
  getCycleTargetWeightKg,
  getGoalCycle,
  getHardestPartAdjustment,
  needsGoalReview,
  summarizeGoalCycle,
} from "@/lib/goal-cycle";
import type { GoalCycleHardestPart } from "@/lib/types";
import { cn, startOfTodayIso } from "@/lib/utils";

type Step = "recap" | "weight" | "hardest" | "feel" | "done";

const HARDEST_PARTS: {
  value: GoalCycleHardestPart;
  label: string;
  icon: ElementType;
}[] = [
  { value: "diet", label: "Sticking to the food", icon: Salad },
  { value: "workouts", label: "The workouts", icon: Dumbbell },
  { value: "time", label: "Finding the time", icon: Clock },
  { value: "motivation", label: "Staying motivated", icon: Flame },
];

// Three buckets, stored on the 1-5 scale so cycles stay comparable if the
// question ever grows finer. Five tappable faces is more precision than
// anyone gives honestly on a one-tap question.
const SATISFACTION_OPTIONS = [
  { value: 5, emoji: "😄", label: "Great" },
  { value: 3, emoji: "🙂", label: "Okay" },
  { value: 1, emoji: "😕", label: "Rough" },
];

// A coach can only address reasons where a human's judgement or accountability
// is the missing piece. "Got busy" and "life came up" call for a lighter plan,
// not a person, so those stay on the free rebuild path.
const STOPPED_REASONS: { label: string; coachFits: boolean }[] = [
  { label: "It got too hard to keep up", coachFits: true },
  { label: "I got busy", coachFits: false },
  { label: "The plan didn't fit me", coachFits: true },
  { label: "I lost interest", coachFits: true },
  { label: "Something else came up", coachFits: false },
];

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-chip bg-foreground/6 px-3 py-3">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-2 text-[17px] font-semibold leading-none text-foreground">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground/40">
        {label}
      </p>
    </div>
  );
}

function ChipButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-chip border px-3.5 py-3 text-left text-[14px] font-semibold transition active:scale-[0.98]",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-foreground/8 bg-white text-foreground/70 hover:border-foreground/16",
      )}
    >
      {children}
    </button>
  );
}

export function GoalWrapUp() {
  const { state, hydrated, completeGoalCycle } = useDietFit();
  const router = useRouter();
  const today = startOfTodayIso();
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState<Step>("recap");
  const [weightInput, setWeightInput] = useState("");
  const [hardestPart, setHardestPart] = useState<GoalCycleHardestPart | null>(null);
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [stoppedReason, setStoppedReason] = useState<string | null>(null);

  const open = hydrated && !dismissed && needsGoalReview(state, today);
  const profile = state.profile;

  const cycle = useMemo(
    () => (profile ? getGoalCycle(profile, today) : null),
    [profile, today],
  );
  const summary = useMemo(
    () => (cycle ? summarizeGoalCycle(state, cycle, today) : null),
    [cycle, state, today],
  );

  if (!open || !profile || !cycle || !summary) {
    return null;
  }

  const startWeightKg = profile.weightKg;
  const targetWeightKg = getCycleTargetWeightKg(profile);
  const endWeightKg = weightInput.trim() === "" ? null : Number(weightInput);
  const hasValidWeight =
    endWeightKg !== null && Number.isFinite(endWeightKg) && endWeightKg >= 35 && endWeightKg <= 250;
  const weightDelta = hasValidWeight
    ? Math.round((endWeightKg - startWeightKg) * 10) / 10
    : null;
  const adjustment = getHardestPartAdjustment(profile, hardestPart);

  function finish(startNextCycle: boolean) {
    completeGoalCycle({
      endWeightKg: hasValidWeight ? endWeightKg : null,
      hardestPart,
      satisfaction,
      note,
      stoppedReason,
      startNextCycle,
    });
    setDismissed(true);
  }

  // Record the cycle so the modal doesn't fire again, hand them off to a coach
  // without auto-generating a new algorithmic plan on top.
  function finishAndTalkToCoach() {
    finish(false);
    router.push("/coach-on-demand");
  }

  const coachUpsellFits =
    stoppedReason !== null &&
    STOPPED_REASONS.some(({ label, coachFits }) => label === stoppedReason && coachFits);

  const targetVerb = profile.primaryGoal === "maintain" ? "to hold" : "for";

  // Someone who drifted away weeks ago gets one question, not a celebration
  // and a four-step form. What made them stop is the only answer worth having.
  const lapsed = !summary.wasEngaged;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/45 backdrop-blur-sm md:items-center md:p-6">
      <div
        className={cn(
          "animate-sheet-up flex max-h-[94dvh] w-full max-w-md flex-col rounded-t-[28px] border border-foreground/7 md:rounded-hero",
          "bg-white",
          "shadow-[0_24px_70px_rgba(12,39,35,0.28)]",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              {lapsed ? "Your plan ended" : `${cycle.totalDays} days done`}
            </p>
            <h2 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.03em] text-foreground">
              {lapsed ? "Let's pick this back up" : "That's your plan finished"}
            </h2>
          </div>
          <button
            aria-label="Close"
            type="button"
            onClick={() => setDismissed(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5 text-foreground/55 transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          {lapsed ? (
            <div className="grid gap-3">
              <div className="rounded-tile border border-foreground/7 bg-white px-4 py-4">
                <p className="text-[14px] leading-[1.5] text-foreground/70">
                  {summary.activeDays > 0 ? (
                    <>
                      You logged{" "}
                      <span className="font-semibold text-foreground">
                        {summary.activeDays} {summary.activeDays === 1 ? "day" : "days"}
                      </span>{" "}
                      of this plan, then it went quiet. No judgement. Knowing why helps
                      us build you a better one.
                    </>
                  ) : (
                    <>
                      This plan ran its {cycle.totalDays} days without much logging. No
                      judgement. Knowing why helps us build you a better one.
                    </>
                  )}
                </p>
              </div>

              <p className="px-1 pt-1 text-[13px] font-semibold text-foreground">
                What got in the way?
              </p>
              <div className="grid gap-2">
                {STOPPED_REASONS.map(({ label }) => (
                  <ChipButton
                    key={label}
                    active={stoppedReason === label}
                    onClick={() =>
                      setStoppedReason((current) => (current === label ? null : label))
                    }
                  >
                    <HeartCrack
                      className={cn(
                        "h-4 w-4 shrink-0",
                        stoppedReason === label ? "text-primary" : "text-foreground/30",
                      )}
                    />
                    {label}
                  </ChipButton>
                ))}
              </div>
            </div>
          ) : step === "recap" ? (
            <div className="grid gap-3">
              <div className="rounded-tile border border-primary/15 bg-primary/7 px-4 py-4">
                <Trophy className="h-5 w-5 text-primary" />
                <p className="mt-2 text-[15px] font-semibold leading-[1.4] text-foreground">
                  You showed up on {summary.activeDays} of the {cycle.totalDays} days.
                </p>
                <p className="mt-1 text-[13px] leading-[1.5] text-foreground/60">
                  Here&apos;s everything you put in since{" "}
                  {new Date(`${cycle.startedOn}T00:00:00`).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                  })}
                  .
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  icon={CalendarCheck}
                  label="Days active"
                  value={`${summary.activeDays} / ${cycle.totalDays}`}
                />
                <StatTile
                  icon={Dumbbell}
                  label="Workouts done"
                  value={`${summary.workoutsCompleted}`}
                />
                <StatTile
                  icon={Utensils}
                  label="Meals logged"
                  value={`${summary.mealsLogged}`}
                />
                <StatTile
                  icon={Flame}
                  label="Best streak"
                  value={`${summary.bestStreak} ${summary.bestStreak === 1 ? "day" : "days"}`}
                />
              </div>
            </div>
          ) : step === "weight" ? (
            <div className="grid gap-3">
              <div className="rounded-tile border border-foreground/7 bg-white px-4 py-4">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-primary" />
                  <p className="text-[15px] font-semibold text-foreground">
                    What do you weigh today?
                  </p>
                </div>
                <p className="mt-1.5 text-[13px] leading-[1.5] text-foreground/55">
                  This is the one thing the app can&apos;t work out on its own, and it
                  sets the numbers for your next plan.
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <input
                    type="number"
                    inputMode="decimal"
                    autoFocus
                    step="0.1"
                    placeholder={`${startWeightKg}`}
                    value={weightInput}
                    onChange={(event) => setWeightInput(event.target.value)}
                    className="w-32 rounded-chip border border-black/10 bg-white px-4 py-3 text-[22px] font-semibold text-foreground outline-none focus:border-primary"
                  />
                  <span className="text-[15px] font-semibold text-foreground/45">kg</span>
                </div>

                <div className="mt-3 grid gap-1 text-[13px] text-foreground/55">
                  <p>
                    You started at{" "}
                    <span className="font-semibold text-foreground">{startWeightKg} kg</span>
                    {targetWeightKg !== null ? (
                      <>
                        , aiming {targetVerb}{" "}
                        <span className="font-semibold text-foreground">
                          {targetWeightKg} kg
                        </span>
                      </>
                    ) : null}
                    .
                  </p>
                  {weightDelta !== null ? (
                    <p className="font-semibold text-primary">
                      {weightDelta === 0
                        ? "Same as where you started."
                        : `${weightDelta > 0 ? "+" : ""}${weightDelta} kg over ${cycle.totalDays} days.`}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : step === "hardest" ? (
            <div className="grid gap-2">
              <p className="px-1 pb-1 text-[15px] font-semibold text-foreground">
                What was hardest to stick with?
              </p>
              {HARDEST_PARTS.map((part) => {
                const Icon = part.icon;
                const active = hardestPart === part.value;

                return (
                  <ChipButton
                    key={part.value}
                    active={active}
                    onClick={() => {
                      setHardestPart(part.value);
                      setStep("feel");
                    }}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-primary" : "text-foreground/30",
                      )}
                    />
                    {part.label}
                  </ChipButton>
                );
              })}
            </div>
          ) : step === "feel" ? (
            <div className="grid gap-3">
              <p className="px-1 text-[15px] font-semibold text-foreground">
                How did these {cycle.totalDays} days go for you?
              </p>
              <div className="grid grid-cols-3 gap-2">
                {SATISFACTION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={satisfaction === option.value}
                    onClick={() => setSatisfaction(option.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-tile border px-2 py-4 transition active:scale-[0.97]",
                      satisfaction === option.value
                        ? "border-primary bg-primary/10"
                        : "border-foreground/8 bg-white",
                    )}
                  >
                    <span className="text-[26px] leading-none">{option.emoji}</span>
                    <span className="text-[12px] font-semibold text-foreground">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>

              <label className="mt-1 block">
                <span className="px-1 text-[13px] font-semibold text-foreground/55">
                  Anything you&apos;d change? (optional)
                </span>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Skip this if you'd rather not."
                  className="mt-2 w-full resize-none rounded-chip border border-foreground/10 bg-white px-3.5 py-3 text-[14px] leading-[1.5] text-foreground outline-none placeholder:text-foreground/30 focus:border-primary"
                />
              </label>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="rounded-tile border border-primary/15 bg-primary/7 px-4 py-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <p className="mt-2 text-[15px] font-semibold leading-[1.4] text-foreground">
                  Your next {cycle.totalDays} days are ready.
                </p>
                <p className="mt-1 text-[13px] leading-[1.5] text-foreground/60">
                  {adjustment.label ||
                    "Same structure, rebuilt around where you are now."}
                </p>
              </div>

              {hasValidWeight ? (
                <div className="rounded-tile bg-foreground/6 px-4 py-3.5 text-[13px] leading-[1.5] text-foreground/60">
                  Starting from{" "}
                  <span className="font-semibold text-foreground">{endWeightKg} kg</span>
                  . Your calories and protein have been recalculated around it.
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 pb-5 pt-3">
          {lapsed ? (
            <div className="grid gap-2">
              <Button variant="brand" onClick={() => finish(true)}>
                Build me a fresh plan
              </Button>
              {coachUpsellFits ? (
                <Button variant="secondary" onClick={finishAndTalkToCoach}>
                  <MessageCircleHeart className="mr-1.5 h-4 w-4" />
                  Talk to a coach instead
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => finish(false)}>
                Not right now
              </Button>
            </div>
          ) : step === "recap" ? (
            <Button variant="brand" className="w-full" onClick={() => setStep("weight")}>
              Continue
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : step === "weight" ? (
            <div className="grid grid-cols-[0.8fr_1.2fr] gap-3">
              <Button variant="secondary" onClick={() => setStep("hardest")}>
                Skip
              </Button>
              <Button
                variant="brand"
                disabled={weightInput.trim() !== "" && !hasValidWeight}
                onClick={() => setStep("hardest")}
              >
                Continue
              </Button>
            </div>
          ) : step === "hardest" ? (
            <Button variant="ghost" className="w-full" onClick={() => setStep("feel")}>
              None of these
            </Button>
          ) : step === "feel" ? (
            <Button variant="brand" className="w-full" onClick={() => setStep("done")}>
              Continue
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <div className="grid gap-2">
              <Button variant="brand" onClick={() => finish(true)}>
                Start my next {cycle.totalDays} days
              </Button>
              <Button variant="ghost" onClick={() => finish(false)}>
                Not right now
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
