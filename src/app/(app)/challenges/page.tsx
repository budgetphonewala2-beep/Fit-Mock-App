"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Dumbbell,
  Droplets,
  Flame,
  Lock,
  RotateCcw,
  Salad,
  Share2,
  Trophy,
  Users,
  X,
  Zap,
  Calendar,
  Info,
  Target,
} from "lucide-react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { ChallengeIntro } from "@/components/challenges/challenge-intro";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { IconBadge } from "@/components/glass/icon-badge";
import { fetchChallengeStats } from "@/lib/challenge-stats";
import { nativeBridge } from "@/lib/native-bridge";
import { renderChallengeShareCard } from "@/lib/share-cards";
import { challengeShareText } from "@/lib/share-text";
import { cn, startOfTodayIso } from "@/lib/utils";
import type { DietFitState } from "@/lib/types";

type ChallengeDefinition = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  howItWorks: string[];
  durationDays: number;
  icon: React.ElementType;
  color: string;
  bg: string;
  checkDay: (date: string, state: DietFitState) => boolean;
};

const CHALLENGES: ChallengeDefinition[] = [
  {
    id: "protein-30",
    title: "30-Day Protein",
    tagline: "Hit your daily protein target every day for 30 days.",
    description: "Consistent protein intake is the single biggest driver of muscle growth and fat loss. This challenge keeps you accountable for a full month.",
    howItWorks: [
      "Log your meals daily in the Diet tab",
      "Each day you hit 90%+ of your protein target counts",
      "Miss a day? Your streak resets but your progress stays",
    ],
    durationDays: 30,
    icon: Zap,
    color: "var(--accent)",
    bg: "rgba(242,132,58,0.10)",
    checkDay: (date, state) => {
      if (!state.nutritionTargets) return false;
      const logs = state.mealLogs.filter((m) => m.loggedAt.startsWith(date));
      const protein = logs.reduce((s, m) => s + m.estimatedNutrition.proteinG, 0);
      return protein >= state.nutritionTargets.proteinG * 0.9;
    },
  },
  {
    id: "workout-21",
    title: "21-Day Consistency",
    tagline: "Complete at least 3 workouts per week for 3 weeks.",
    description: "21 days is the magic number for building lasting habits. Three weeks of consistent training rewires your routine permanently.",
    howItWorks: [
      "Complete any workout session (home or gym)",
      "Aim for at least 3 sessions per week",
      "Rest days are fine, just hit your weekly minimum",
    ],
    durationDays: 21,
    icon: Dumbbell,
    color: "var(--primary)",
    bg: "rgba(21,133,122,0.10)",
    checkDay: (date, state) =>
      state.workoutLogs.some((l) => l.sessionDate === date && l.completedSession),
  },
  {
    id: "no-rest-month",
    title: "No Rest Month",
    tagline: "Log at least one workout every single day for 30 days.",
    description: "For the truly committed. Every single day for 30 days, no exceptions. Even a 10-minute walk counts as long as you log it.",
    howItWorks: [
      "Log a completed workout session every day",
      "Short sessions count. Just keep the streak alive",
      "One missed day ends the challenge",
    ],
    durationDays: 30,
    icon: Flame,
    color: "var(--primary-strong)",
    bg: "rgba(14,75,69,0.10)",
    checkDay: (date, state) =>
      state.workoutLogs.some((l) => l.sessionDate === date && l.completedSession),
  },
  {
    id: "hydration-7",
    title: "Hydration Week",
    tagline: "Hit your daily water target 7 days in a row.",
    description: "Most people are chronically dehydrated without realizing it. One focused week of proper hydration can transform your energy and performance.",
    howItWorks: [
      "Log your water intake daily in the Diet tab",
      "Hit 90%+ of your daily water target each day",
      "All 7 days must be consecutive",
    ],
    durationDays: 7,
    icon: Droplets,
    color: "#3d9bef",
    bg: "rgba(61,155,239,0.12)",
    checkDay: (date, state) => {
      if (!state.nutritionTargets) return false;
      const log = state.waterLogs.find((l) => l.date === date);
      const targetMl = state.nutritionTargets.micros.waterL * 1000;
      return (log?.amountMl ?? 0) >= targetMl * 0.9;
    },
  },
  {
    id: "meal-streak-21",
    title: "21-Day Meal Streak",
    tagline: "Log at least 3 meals every day for 21 days straight.",
    description: "Structured eating is the foundation of any nutrition plan. Three meals a day, logged for 21 days, builds the habit that makes everything else easier.",
    howItWorks: [
      "Log breakfast, lunch, and dinner (or any 3 meal types) each day",
      "Use the AI Coach to quickly log meals by describing them",
      "All 21 days must have 3+ logged meals",
    ],
    durationDays: 21,
    icon: Salad,
    color: "var(--forest)",
    bg: "rgba(31,163,131,0.12)",
    checkDay: (date, state) => {
      const count = new Set(
        state.mealLogs.filter((m) => m.loggedAt.startsWith(date)).map((m) => m.mealType),
      ).size;
      return count >= 3;
    },
  },
  {
    id: "fruits-30",
    title: "Fruits Intake Challenge",
    tagline: "Include at least one fruit in your meals every day for 30 days.",
    description: "Fruits are nature's multivitamins, packed with fiber, antioxidants, and micronutrients most people are missing. 30 days to make them a non-negotiable.",
    howItWorks: [
      "Include any fruit in at least one meal per day",
      "Log it in the Diet tab and mention the fruit by name",
      "Smoothies, whole fruits, or fruit in recipes all count",
    ],
    durationDays: 30,
    icon: Flame,
    color: "var(--brand)",
    bg: "rgba(55,201,166,0.14)",
    checkDay: (date, state) => {
      const FRUITS =
        /\b(apple|banana|mango|orange|grape|papaya|guava|pomegranate|watermelon|strawberr|blueberr|pear|peach|plum|kiwi|pineapple|lemon|lime|cherry|cherries|fig|date|coconut|melon|avocado|berry|berries|fruit)\b/i;
      return state.mealLogs
        .filter((m) => m.loggedAt.startsWith(date))
        .some((m) => FRUITS.test(m.rawText) || m.parsedItems.some((item) => FRUITS.test(item.name)));
    },
  },
];

// Challenges past this position are locked at install. Each completed
// challenge unlocks the next one, so users build a track record before
// they can pile on commitments.
const INITIAL_UNLOCKED_CHALLENGES = 4;

// Seeded participant floors — day-one devices would otherwise show
// embarrassingly small counts. Real enrolments land on top of these via
// fetchChallengeStats + the Firestore counter the provider increments on
// first enrol; the gap closes as the cohort grows and the seed stops
// mattering.
const PARTICIPANT_SEEDS: Record<string, number> = {
  "protein-30":     3241,
  "workout-21":     1876,
  "no-rest-month":  892,
  "hydration-7":    4102,
  "meal-streak-21": 2156,
  "fruits-30":      1543,
};

const CHALLENGE_IDS = Object.keys(PARTICIPANT_SEEDS);

function totalParticipants(
  challengeId: string,
  live: Record<string, number>,
) {
  return (PARTICIPANT_SEEDS[challengeId] ?? 0) + (live[challengeId] ?? 0);
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function computeProgress(challenge: ChallengeDefinition, startedAt: string, state: DietFitState) {
  const today = startOfTodayIso();
  const elapsed = Math.min(
    differenceInCalendarDays(parseISO(today), parseISO(startedAt)) + 1,
    challenge.durationDays,
  );
  let completedDays = 0;
  let missedDays = 0;
  for (let i = 0; i < elapsed; i++) {
    const date = format(addDays(parseISO(startedAt), i), "yyyy-MM-dd");
    if (challenge.checkDay(date, state)) {
      completedDays++;
    } else if (date < today) {
      // A past day (not today) that wasn't met — the daily streak is broken.
      missedDays++;
    }
  }
  const isComplete = elapsed >= challenge.durationDays && completedDays >= challenge.durationDays;
  const daysLeft = Math.max(0, challenge.durationDays - elapsed);
  // These challenges require hitting the target every day, so a single missed
  // past day means a perfect run is no longer possible → off track.
  const isOffTrack = missedDays > 0 && !isComplete;
  return { completedDays, elapsed, daysLeft, isComplete, isOffTrack };
}

function ProgressBar({
  value,
  max,
  color,
  trackClassName = "bg-foreground/8",
}: {
  value: number;
  max: number;
  color: string;
  trackClassName?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className={cn("mt-3 h-1.5 w-full overflow-hidden rounded-full", trackClassName)}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function ShareCard({
  challenge,
  completedDays,
  userName,
  onClose,
}: {
  challenge: ChallengeDefinition;
  completedDays: number;
  userName: string;
  onClose: () => void;
}) {
  const Icon = challenge.icon;

  async function handleShare() {
    const text = challengeShareText(challenge.title);
    const subject = `${challenge.title} | Fitmonk`;

    // Route through the native bridge so the OS share sheet opens in the
    // Flutter shell too — a raw navigator.share silently no-ops there. Render
    // the card first; fall back to text-only if canvas fails.
    try {
      const image = await renderChallengeShareCard({
        title: challenge.title,
        completedDays,
        color: challenge.color,
        userName: userName !== "You" ? userName.split(" ")[0] : undefined,
      });
      await nativeBridge.device.shareImage({
        text,
        subject,
        image,
        filename: `fitmonk-${challenge.id}`,
      });
    } catch {
      await nativeBridge.device.share({ text, subject }).catch(() => null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/60 backdrop-blur-sm md:items-center">
      <div className="animate-sheet-up w-full max-w-sm rounded-t-[32px] md:rounded-panel">
        <div
          className="relative overflow-hidden rounded-t-[32px] px-6 pb-8 pt-8 md:rounded-panel"
          style={{ background: `linear-gradient(145deg, var(--foreground) 0%, var(--primary) 100%)` }}
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-10" style={{ background: challenge.color }} />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full opacity-10" style={{ background: challenge.color }} />
          <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-chip" style={{ background: `${challenge.color}30` }}>
              <Icon className="h-6 w-6" style={{ color: challenge.color }} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Challenge complete</p>
              <p className="text-[17px] font-semibold leading-tight text-white">{challenge.title}</p>
            </div>
          </div>
          <div className="mt-6 flex items-end gap-2">
            <span className="text-[52px] font-semibold leading-none text-white">{completedDays}</span>
            <span className="mb-2 text-[16px] font-medium text-white/50">days</span>
          </div>
          <p className="mt-1 text-[13px] leading-5 text-white/55">{challenge.tagline}</p>
          <div className="mt-5 flex items-center gap-2 rounded-chip bg-white/8 px-4 py-3">
            <Trophy className="h-4 w-4 shrink-0 text-mint-medium" />
            <p className="text-[12px] text-white/60">
              Completed by <span className="font-semibold text-white/90">{userName}</span> · Fitmonk
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-b-[32px] bg-primary-strong px-5 pb-6 pt-4 md:rounded-panel">
          <button type="button" onClick={onClose} className="rounded-chip border border-white/10 bg-white/8 py-3 text-[13px] font-semibold text-white/60 transition active:scale-[0.97]">
            Close
          </button>
          <button type="button" onClick={handleShare} className="flex items-center justify-center gap-2 rounded-chip py-3 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.3)] transition active:scale-[0.97]" style={{ background: challenge.color }}>
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>
      </div>
    </div>
  );
}

function ChallengeDetailPage({
  challenge,
  startedAt,
  state,
  participantsTotal,
  onBack,
  onJoin,
  onLeave,
  onRestart,
  onShare,
}: {
  challenge: ChallengeDefinition;
  startedAt: string | null;
  state: DietFitState;
  participantsTotal: number;
  onBack: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onRestart: () => void;
  onShare: (completedDays: number) => void;
}) {
  const Icon = challenge.icon;
  const p = startedAt ? computeProgress(challenge, startedAt, state) : null;
  const today = startOfTodayIso();

  return (
    <div className="glass-ui relative min-h-screen pb-28">
      <GlassBackdrop />
      <div className="relative mx-auto max-w-[460px] px-4">
        {/* Header */}
        <div className="flex items-center gap-3 pt-[calc(0.75rem+var(--safe-top))]">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to challenges"
            className="glass flex h-9 w-9 items-center justify-center rounded-full transition active:scale-[0.95]"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </button>
          <p className="text-[12px] font-medium text-foreground/55">Challenge</p>
        </div>

        {/* Hero */}
        <div className="glass-dark mt-4 rounded-hero px-4 py-4">
          <IconBadge tone="dark">
            <Icon className="h-4 w-4" />
          </IconBadge>
          <h1 className="mt-3 text-[21px] font-medium leading-tight tracking-[-0.02em] text-white">{challenge.title}</h1>
          <p className="mt-1 text-[13px] leading-[1.45] text-white/70">{challenge.tagline}</p>

          {/* Stats row */}
          <div className="mt-4 flex gap-2">
            <div className="flex flex-1 flex-col items-center rounded-[14px] bg-white/12 px-3 py-2">
              <Calendar className="h-3.5 w-3.5 text-white/55" />
              <span className="mt-1 text-[15px] font-medium">{challenge.durationDays}</span>
              <span className="text-[10px] text-white/60">days</span>
            </div>
            {participantsTotal >= 100 && (
              <div className="flex flex-1 flex-col items-center rounded-[14px] bg-white/12 px-3 py-2">
                <Users className="h-3.5 w-3.5 text-white/55" />
                <span className="mt-1 text-[15px] font-medium">{formatCount(participantsTotal)}</span>
                <span className="text-[10px] text-white/60">joined</span>
              </div>
            )}
          </div>

          {/* Progress if enrolled */}
          {p && startedAt && (
            p.isOffTrack ? (
              <div className="mt-4 rounded-[14px] bg-white/10 px-4 py-3">
                <p className="text-[13px] font-semibold">Streak broken</p>
                <p className="mt-0.5 text-[12px] leading-[1.5] text-white/65">
                  You missed a day, so a perfect run isn&apos;t possible. Rejoin to restart from today.
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex items-end justify-between gap-2">
                  {p.isComplete ? (
                    <span className="text-[17px] font-medium">Challenge complete!</span>
                  ) : (
                    <span>
                      <span className="text-[34px] font-light leading-none tracking-[-0.04em]">{p.completedDays}</span>
                      <span className="text-[12px] text-white/60">/{challenge.durationDays} days done</span>
                    </span>
                  )}
                  <span className="text-[11px] text-white/65">{p.daysLeft > 0 ? `${p.daysLeft} left` : "Finished"}</span>
                </div>
                <ProgressBar
                  value={p.completedDays}
                  max={challenge.durationDays}
                  color="var(--mint-medium)"
                  trackClassName="bg-white/20"
                />
              </div>
            )
          )}
        </div>

        {/* About */}
        <div className="glass mt-3 rounded-card px-4 py-3.5">
          <div className="flex items-center gap-2">
            <IconBadge className="h-7 w-7">
              <Info className="h-3.5 w-3.5" />
            </IconBadge>
            <p className="text-[14px] font-medium text-foreground">About</p>
          </div>
          <p className="mt-2 text-[13px] leading-[1.55] text-foreground/70">{challenge.description}</p>
        </div>

        {/* How it works */}
        <div className="glass mt-3 rounded-card px-4 py-3.5">
          <div className="flex items-center gap-2">
            <IconBadge className="h-7 w-7">
              <Target className="h-3.5 w-3.5" />
            </IconBadge>
            <p className="text-[14px] font-medium text-foreground">How it works</p>
          </div>
          <ul className="mt-3 grid gap-2.5">
            {challenge.howItWorks.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="glass-inset mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-foreground/70">
                  {i + 1}
                </span>
                <span className="text-[13px] leading-[1.5] text-foreground/70">{step}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Day tracker if enrolled */}
        {p && startedAt && (
          <div className="glass mt-3 rounded-card px-4 py-3.5">
            <div className="flex items-center gap-2">
              <IconBadge className="h-7 w-7">
                <Calendar className="h-3.5 w-3.5" />
              </IconBadge>
              <p className="text-[14px] font-medium text-foreground">Day tracker</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Array.from({ length: challenge.durationDays }).map((_, i) => {
                const date = format(addDays(parseISO(startedAt), i), "yyyy-MM-dd");
                const done = challenge.checkDay(date, state);
                const isFuture = i >= p.elapsed;
                const isToday = date === today;
                return (
                  <div
                    key={i}
                    title={format(parseISO(date), "MMM d")}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-[8px] text-[10px] font-semibold transition",
                      done
                        ? "bg-primary-strong text-white"
                        : isToday
                          ? // Today isn't over yet, so it's outlined, not marked missed.
                            "border-2 border-primary-strong bg-transparent text-primary-strong"
                          : isFuture
                            ? "glass-inset text-foreground/35"
                            : "bg-accent/15 text-accent/70",
                    )}
                  >
                    {i + 1}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-5">
          {!p ? (
            <button
              type="button"
              onClick={onJoin}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary-strong py-4 text-[15px] font-semibold text-white shadow-[0_12px_28px_rgba(12,39,35,0.22)] transition active:scale-[0.97]"
            >
              Join challenge
            </button>
          ) : p.isComplete ? (
            <button
              type="button"
              onClick={() => onShare(p.completedDays)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary-strong py-4 text-[15px] font-semibold text-white shadow-[0_12px_28px_rgba(12,39,35,0.22)] transition active:scale-[0.97]"
            >
              <Share2 className="h-4 w-4" />
              Share achievement
            </button>
          ) : p.isOffTrack ? (
            <div className="grid gap-3">
              <button
                type="button"
                onClick={onRestart}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary-strong py-4 text-[15px] font-semibold text-white shadow-[0_12px_28px_rgba(12,39,35,0.22)] transition active:scale-[0.97]"
              >
                <RotateCcw className="h-4 w-4" />
                Rejoin &amp; restart
              </button>
              <button
                type="button"
                onClick={onLeave}
                className="glass w-full rounded-full py-3 text-[13px] font-semibold text-foreground/60 transition active:scale-[0.97]"
              >
                Leave challenge
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLeave}
              className="glass w-full rounded-full py-4 text-[14px] font-semibold text-foreground/60 transition active:scale-[0.97]"
            >
              Leave challenge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChallengesPage() {
  const { state, hydrated, enrollChallenge, unenrollChallenge, restartChallenge } = useDietFit();
  const [shareChallenge, setShareChallenge] = useState<{ challenge: ChallengeDefinition; completedDays: number } | null>(null);
  const [detailChallenge, setDetailChallenge] = useState<ChallengeDefinition | null>(null);
  const [introChallenge, setIntroChallenge] = useState<ChallengeDefinition | null>(null);
  // Per-challenge participant count from Firestore, on top of the seeded
  // floors. Fetched once per visit; a failed fetch just means the display
  // falls back to the seeds alone.
  const [liveParticipants, setLiveParticipants] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetchChallengeStats(CHALLENGE_IDS).then((counts) => {
      if (!cancelled) setLiveParticipants(counts);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The intro is the pitch, so it plays every time an unjoined challenge is
  // opened and stops for good once the user commits. Gated on hydration,
  // since before it the enrollments are empty and everyone looks unjoined.
  function openChallenge(challenge: ChallengeDefinition) {
    setDetailChallenge(challenge);
    const joined = state.challengeEnrollments.some((e) => e.challengeId === challenge.id);
    if (hydrated && !joined) {
      setIntroChallenge(challenge);
    }
  }

  const { active, available, enrolledMap } = useMemo(() => {
    const enrolled = new Map(state.challengeEnrollments.map((e) => [e.challengeId, e.startedAt]));
    const active: { challenge: ChallengeDefinition; startedAt: string }[] = [];
    const available: ChallengeDefinition[] = [];
    for (const c of CHALLENGES) {
      const startedAt = enrolled.get(c.id);
      if (startedAt) active.push({ challenge: c, startedAt });
      else available.push(c);
    }
    return { active, available, enrolledMap: enrolled };
  }, [state.challengeEnrollments]);

  const completedCount = active.filter(({ challenge, startedAt }) =>
    computeProgress(challenge, startedAt, state).isComplete,
  ).length;

  // Locks walk the catalog in order: once the user finishes one, the next
  // one down the list opens up. Already-enrolled challenges are grandfathered
  // in the active list, so locking only affects the Available section.
  const unlockedCap = INITIAL_UNLOCKED_CHALLENGES + completedCount;

  const userName = state.profile?.name ?? "You";

  if (detailChallenge) {
    const startedAt = enrolledMap.get(detailChallenge.id) ?? null;
    return (
      <>
        <ChallengeDetailPage
          challenge={detailChallenge}
          startedAt={startedAt}
          state={state}
          participantsTotal={totalParticipants(detailChallenge.id, liveParticipants)}
          onBack={() => setDetailChallenge(null)}
          onJoin={() => { enrollChallenge(detailChallenge.id); }}
          onLeave={() => { unenrollChallenge(detailChallenge.id); setDetailChallenge(null); }}
          onRestart={() => { restartChallenge(detailChallenge.id); }}
          onShare={(completedDays) => setShareChallenge({ challenge: detailChallenge, completedDays })}
        />
        {shareChallenge && (
          <ShareCard
            challenge={shareChallenge.challenge}
            completedDays={shareChallenge.completedDays}
            userName={userName}
            onClose={() => setShareChallenge(null)}
          />
        )}
        {introChallenge && (
          <ChallengeIntro
            title={introChallenge.title}
            subtitle={introChallenge.tagline}
            memberCount={totalParticipants(introChallenge.id, liveParticipants)}
            icon={introChallenge.icon}
            onCta={() => enrollChallenge(introChallenge.id)}
            onDone={() => setIntroChallenge(null)}
          />
        )}
      </>
    );
  }

  return (
    <div className="glass-ui relative min-h-screen pb-28">
      <GlassBackdrop />

      <div className="relative mx-auto max-w-[460px] px-4">
        {/* Header */}
        <div className="pt-[calc(0.75rem+var(--safe-top))]">
          <h1 className="text-[28px] font-medium leading-tight tracking-[-0.03em] text-foreground">Challenges</h1>
          {completedCount > 0 && (
            <div className="glass mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
              <Trophy className="h-3.5 w-3.5 text-primary-strong" />
              <span className="text-[12px] font-semibold text-primary-strong">
                {completedCount} challenge{completedCount > 1 ? "s" : ""} completed
              </span>
            </div>
          )}
        </div>

        {/* Active challenges */}
        {active.length > 0 && (
          <div className="mt-6">
            <p className="mb-2.5 px-1 text-[15px] font-medium text-foreground">You joined</p>
            <div className="grid gap-3">
              {active.map(({ challenge, startedAt }) => {
                const Icon = challenge.icon;
                const p = computeProgress(challenge, startedAt, state);
                const percent = Math.round((p.completedDays / challenge.durationDays) * 100);
                // Every joined challenge is the same compact dark-glass card:
                // icon, title and status on one row, progress underneath.
                return (
                  <div
                    key={challenge.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openChallenge(challenge)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openChallenge(challenge);
                      }
                    }}
                    className="glass-dark w-full cursor-pointer rounded-[22px] px-3.5 py-3 text-left transition active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3">
                      <IconBadge tone="dark">
                        <Icon className="h-4 w-4" />
                      </IconBadge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium leading-tight">{challenge.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-white/65">
                          {p.isComplete
                            ? "Challenge complete!"
                            : p.isOffTrack
                              ? "Streak broken, you missed a day"
                              : `${p.daysLeft} left · ${percent}% complete`}
                        </p>
                      </div>
                      {p.isOffTrack ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); restartChallenge(challenge.id); }}
                          aria-label={`Rejoin and restart ${challenge.title}`}
                          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-primary-strong transition active:scale-[0.97]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Rejoin
                        </button>
                      ) : p.isComplete ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setShareChallenge({ challenge, completedDays: p.completedDays }); }}
                          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-primary-strong transition active:scale-[0.97]"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          Share
                        </button>
                      ) : (
                        <span className="shrink-0">
                          <span className="text-[26px] font-light leading-none tracking-[-0.04em]">
                            {p.completedDays}
                          </span>
                          <span className="text-[11px] text-white/60">/{challenge.durationDays}</span>
                        </span>
                      )}
                    </div>
                    {p.isOffTrack ? null : (
                      <ProgressBar
                        value={p.completedDays}
                        max={challenge.durationDays}
                        color="var(--mint-medium)"
                        trackClassName="mt-2.5 bg-white/20"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Available challenges */}
        {available.length > 0 && (
          <div className="mt-6">
            <p className="mb-2.5 px-1 text-[15px] font-medium text-foreground">
              {active.length > 0 ? "More challenges" : "Available challenges"}
            </p>
            <div className="grid gap-3">
              {available.map((challenge) => {
                const Icon = challenge.icon;
                const participantsCount = totalParticipants(challenge.id, liveParticipants);
                const globalIndex = CHALLENGES.findIndex((c) => c.id === challenge.id);
                const locked = globalIndex >= unlockedCap;
                const finishMore = locked ? globalIndex - unlockedCap + 1 : 0;
                if (locked) {
                  return (
                    <div key={challenge.id} className="glass rounded-hero p-3.5 opacity-70">
                      <div className="flex w-full items-start gap-3 text-left">
                        <IconBadge className="h-10 w-10">
                          <Icon className="h-5 w-5 text-foreground/40" />
                        </IconBadge>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-[15px] font-medium tracking-[-0.01em] text-foreground/60">{challenge.title}</span>
                            <span className="glass-inset shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-foreground/40">
                              {challenge.durationDays}d
                            </span>
                          </span>
                          <span className="mt-1 block text-[12px] leading-[1.4] text-foreground/45">{challenge.tagline}</span>
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-foreground/5 py-2.5 text-[13px] font-semibold text-foreground/55">
                        <Lock className="h-3.5 w-3.5" />
                        {finishMore === 1
                          ? "Finish 1 challenge to unlock"
                          : `Finish ${finishMore} more challenges to unlock`}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={challenge.id} className="glass rounded-hero p-3.5">
                    <button
                      type="button"
                      onClick={() => openChallenge(challenge)}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <IconBadge className="h-10 w-10">
                        <Icon className="h-5 w-5" style={{ color: challenge.color }} />
                      </IconBadge>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-[15px] font-medium tracking-[-0.01em] text-foreground">{challenge.title}</span>
                          <span className="glass-inset shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ color: challenge.color }}>
                            {challenge.durationDays}d
                          </span>
                        </span>
                        <span className="mt-1 block text-[12px] leading-[1.4] text-foreground/60">{challenge.tagline}</span>
                        {participantsCount >= 100 && (
                          <span className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-foreground/40">
                            <Users className="h-3 w-3" />
                            {formatCount(participantsCount)} joined
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openChallenge(challenge)}
                      className="mt-3 w-full rounded-full bg-primary-strong/90 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(12,39,35,0.16)] transition active:scale-[0.98]"
                    >
                      Join challenge
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {active.length === 0 && available.length === 0 && (
          <div className="mt-16 text-center">
            <Trophy className="mx-auto h-10 w-10 text-foreground/20" />
            <p className="mt-3 text-[14px] font-semibold text-foreground/40">All challenges completed!</p>
          </div>
        )}
      </div>

      {shareChallenge && (
        <ShareCard
          challenge={shareChallenge.challenge}
          completedDays={shareChallenge.completedDays}
          userName={userName}
          onClose={() => setShareChallenge(null)}
        />
      )}
    </div>
  );
}
