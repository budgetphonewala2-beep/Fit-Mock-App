"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock,
  Crown,
  Flame,
  Info,
  MessageCircleHeart,
  Scale,
  Sparkles,
  Target,
  Video,
} from "lucide-react";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { IconBadge } from "@/components/glass/icon-badge";
import { getGoalCycle, summarizeGoalCycle } from "@/lib/goal-cycle";
import { getGoalSummary } from "@/lib/recommendations";
import { startOfTodayIso } from "@/lib/utils";
import type { GoalCycleHardestPart } from "@/lib/types";

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ??
  "https://calendly.com/contact-fitmonk/30min";

const ELITE_WHAT_TO_EXPECT = [
  {
    icon: Video,
    title: "30-minute video call",
    body: "A real trainer walks through your plan, form, and blockers.",
  },
  {
    icon: Sparkles,
    title: "Plan tweaks after the call",
    body: "They adjust your workouts and diet targets based on what you talk through.",
  },
  {
    icon: Clock,
    title: "Once a month, on your calendar",
    body: "Reschedule any time. You get one call included in your plan each month.",
  },
];

const ELITE_UPSELL_POINTS = [
  "A 30-minute monthly video call with a real trainer",
  "Personalized plan changes after every call",
  "Everything in Pro, plus adaptive workouts and the AI diet plan",
];

const HARDEST_PART_LABELS: Record<GoalCycleHardestPart, string> = {
  diet: "sticking to the food",
  workouts: "the workouts",
  time: "finding the time",
  motivation: "staying motivated",
};

const TALKING_POINTS = [
  {
    heading: "What’s been working",
    body: "One or two things you’ve genuinely liked, like food, workouts or timing.",
  },
  {
    heading: "Where you get stuck",
    body: "The moment the plan usually falls apart. The trainer plans around it.",
  },
  {
    heading: "What you want by next call",
    body: "One measurable thing, like a weight, a lift or a habit. Keeps the call focused.",
  },
];

export default function CoachOnDemandPage() {
  const router = useRouter();
  const { state, hydrated } = useDietFit();
  const today = startOfTodayIso();

  const snapshot = useMemo(() => {
    if (!state.profile) {
      return null;
    }

    const cycle = getGoalCycle(state.profile, today);
    const summary = summarizeGoalCycle(state, cycle, today);
    const goal = getGoalSummary(state.profile);
    const lastReview = [...(state.goalReviews ?? [])]
      .reverse()
      .find((review) => review.hardestPart);

    return {
      goalHeadline: goal.headline,
      dayNumber: cycle.dayNumber,
      totalDays: cycle.totalDays,
      weightKg: state.profile.weightKg,
      targetKg: state.profile.goalTargetKg ?? null,
      bestStreak: summary.bestStreak,
      streak: state.streak ?? 0,
      lastHardestPart: (lastReview?.hardestPart ?? null) as GoalCycleHardestPart | null,
    };
  }, [state, today]);

  if (!hydrated) {
    return null;
  }

  const tier = state.subscriptionTier ?? "starter";
  const isElite = tier === "elite";
  const firstName = state.profile?.name?.split(" ")[0] ?? "there";

  const backChevron = (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => router.back()}
      className="glass fixed left-4 top-[calc(0.75rem+var(--safe-top))] z-30 flex h-10 w-10 items-center justify-center rounded-full text-foreground transition active:scale-[0.96]"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  );

  if (isElite) {
    return (
      <div className="glass-ui relative mx-auto max-w-[460px] px-4 pt-[calc(4rem+var(--safe-top))] pb-24">
        <GlassBackdrop />
        {backChevron}
        <div className="glass-dark relative rounded-hero p-5">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-white/75">
            <Crown className="h-3.5 w-3.5 text-accent" />
            Elite perk
          </div>
          <h1 className="mt-2 text-[24px] font-medium leading-tight tracking-[-0.02em]">
            Your monthly trainer call
          </h1>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-white/75">
            {firstName}, one 1-on-1 call with a real trainer is included every month.
            Pick a time that works. They&apos;ll come prepped with your plan.
          </p>

          <a
            href={CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_22px_rgba(242,132,58,0.32)] transition active:scale-[0.98]"
          >
            <CalendarClock className="h-4.5 w-4.5" />
            Book my call
            <ArrowRight className="h-4 w-4" />
          </a>
          <p className="mt-2 text-center text-[11px] text-white/55">
            Opens Calendly in a new tab
          </p>
        </div>

        {snapshot ? (
          <div className="glass relative mt-3 rounded-hero p-3.5">
            <div className="flex items-center gap-2 text-[15px] font-medium text-foreground">
              <IconBadge className="h-8 w-8">
                <ClipboardList className="h-4 w-4" />
              </IconBadge>
              What your trainer will see
            </div>
            <p className="mt-2 text-[12px] leading-[1.5] text-foreground/60">
              We&apos;ll share this snapshot ahead of the call so you don&apos;t waste minutes catching them up.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <SnapshotTile
                icon={Target}
                label="Goal"
                value={snapshot.goalHeadline}
              />
              <SnapshotTile
                icon={CalendarClock}
                label="Plan day"
                value={`${snapshot.dayNumber} / ${snapshot.totalDays}`}
              />
              <SnapshotTile
                icon={Scale}
                label="Weight"
                value={
                  snapshot.targetKg
                    ? `${snapshot.weightKg} → ${snapshot.targetKg} kg`
                    : `${snapshot.weightKg} kg`
                }
              />
              <SnapshotTile
                icon={Flame}
                label={snapshot.streak > 0 ? "Current streak" : "Best streak"}
                value={
                  snapshot.streak > 0
                    ? `${snapshot.streak} ${snapshot.streak === 1 ? "day" : "days"}`
                    : snapshot.bestStreak > 0
                      ? `${snapshot.bestStreak} ${snapshot.bestStreak === 1 ? "day" : "days"}`
                      : "Not yet"
                }
              />
            </div>

            {snapshot.lastHardestPart ? (
              <div className="glass-inset mt-2.5 flex items-start gap-2.5 rounded-[14px] px-3 py-2.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/45" />
                <p className="text-[12px] leading-[1.5] text-foreground/65">
                  Last review, you said{" "}
                  <span className="font-semibold text-foreground">
                    {HARDEST_PART_LABELS[snapshot.lastHardestPart]}
                  </span>{" "}
                  was the hardest part. They&apos;ll start there.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Warm-tinted so the prep list still stands apart from the rest. */}
        <div className="glass relative mt-3 rounded-hero bg-accent-soft/60! p-3.5">
          <div className="flex items-center gap-2 text-[15px] font-medium text-foreground">
            <IconBadge className="h-8 w-8 border-accent/40 text-accent">
              <MessageCircleHeart className="h-4 w-4" />
            </IconBadge>
            Come ready to talk about
          </div>
          <ol className="mt-3 grid gap-2.5">
            {TALKING_POINTS.map(({ heading, body }, index) => (
              <li key={heading} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{heading}</p>
                  <p className="mt-0.5 text-[12px] leading-[1.5] text-foreground/55">{body}</p>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative mt-4 grid gap-2">
          <p className="px-1 text-[15px] font-medium text-foreground">
            What to expect
          </p>
          {ELITE_WHAT_TO_EXPECT.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="glass flex gap-3 rounded-[20px] px-3.5 py-3"
            >
              <IconBadge className="h-9 w-9 text-primary">
                <Icon className="h-4 w-4" />
              </IconBadge>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-[12px] leading-[1.5] text-foreground/55">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-inset relative mt-3 rounded-[18px] px-4 py-3.5 text-[12px] leading-[1.5] text-foreground/65">
          Trouble finding a slot? Email{" "}
          <a
            href="mailto:contact@fitmonk.online"
            className="font-semibold text-primary underline underline-offset-2"
          >
            contact@fitmonk.online
          </a>{" "}
          and someone will sort a time with you directly.
        </div>
      </div>
    );
  }

  return (
    <div className="glass-ui relative mx-auto max-w-[460px] px-4 pt-[calc(4rem+var(--safe-top))] pb-24">
      <GlassBackdrop />
      {backChevron}
      <div className="glass relative rounded-hero bg-accent-soft/65! p-5">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-accent">
          <MessageCircleHeart className="h-3.5 w-3.5" />
          Elite plan
        </div>
        <h1 className="mt-2 text-[24px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          Talk to a real trainer, every month.
        </h1>
        <p className="mt-2 text-[14px] leading-[1.55] text-foreground/65">
          When the plan alone isn&apos;t landing, a 1-on-1 call with a trainer can move
          things that an AI can&apos;t. Elite includes one every month.
        </p>

        <ul className="mt-4 grid gap-2">
          {ELITE_UPSELL_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-[13px] text-foreground/75">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_22px_rgba(242,132,58,0.32)] transition active:scale-[0.98]"
          onClick={() =>
            router.push("/paywall?upgrade=1&feature=trainer-call&return=/coach-on-demand")
          }
        >
          <Crown className="h-4.5 w-4.5" />
          Upgrade to Elite
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <p className="relative mt-3 px-1 text-center text-[12px] text-foreground/55">
        Cancel or switch back any time.
      </p>
    </div>
  );
}

function SnapshotTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-inset rounded-[14px] px-3 py-2.5">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-1.5 text-[11px] text-foreground/55">
        {label}
      </p>
      <p className="mt-0.5 text-[13.5px] leading-tight text-foreground first-letter:uppercase">
        {value}
      </p>
    </div>
  );
}
