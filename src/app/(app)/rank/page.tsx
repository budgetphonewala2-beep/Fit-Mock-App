"use client";

import { useState } from "react";
import { Crown, Flame, Lock, Medal, Trophy, Users } from "lucide-react";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { cn } from "@/lib/utils";

function getWeightBracket(weightKg: number): { min: number; max: number; label: string } {
  const min = Math.floor(weightKg / 10) * 10;
  const max = min + 10;
  return { min, max, label: `${min}–${max} kg` };
}

type LeaderboardEntry = {
  rank: number;
  name: string;
  points: number;
  streak: number;
  isYou: boolean;
  avatar: string;
};

const globalLeaderboardSeed: Omit<LeaderboardEntry, "rank" | "isYou">[] = [
  { name: "Arjun M.", points: 1240, streak: 18, avatar: "🏋️" },
  { name: "Priya S.", points: 1180, streak: 15, avatar: "💪" },
  { name: "Rahul K.", points: 1050, streak: 12, avatar: "🔥" },
  { name: "Sneha R.", points: 980, streak: 11, avatar: "⚡" },
  { name: "Vikram D.", points: 920, streak: 9, avatar: "🎯" },
  { name: "Ananya P.", points: 860, streak: 8, avatar: "✨" },
  { name: "Karan T.", points: 780, streak: 7, avatar: "💫" },
  { name: "Meera J.", points: 720, streak: 6, avatar: "🌟" },
  { name: "Rohan B.", points: 650, streak: 5, avatar: "🏃" },
  { name: "Divya N.", points: 580, streak: 4, avatar: "🍀" },
  { name: "Amit G.", points: 510, streak: 3, avatar: "🎖️" },
  { name: "Neha V.", points: 440, streak: 2, avatar: "💎" },
];

const friendsLeaderboardSeed: Omit<LeaderboardEntry, "rank" | "isYou">[] = [
  { name: "Aditya S.", points: 920, streak: 10, avatar: "🏋️" },
  { name: "Riya P.", points: 780, streak: 8, avatar: "💪" },
  { name: "Nikhil K.", points: 620, streak: 6, avatar: "🔥" },
  { name: "Isha M.", points: 540, streak: 5, avatar: "⚡" },
  { name: "Dev R.", points: 380, streak: 3, avatar: "🎯" },
];

function buildLeaderboard(
  seed: Omit<LeaderboardEntry, "rank" | "isYou">[],
  userName: string,
  userPoints: number,
  userStreak: number,
): LeaderboardEntry[] {
  const all = [
    ...seed.map((entry) => ({ ...entry, isYou: false })),
    { name: userName, points: userPoints, streak: userStreak, isYou: true, avatar: "👤" },
  ];

  all.sort((a, b) => b.points - a.points);

  return all.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent shadow-[0_4px_14px_rgba(242,132,58,0.35)]">
        <Crown className="h-4.5 w-4.5 text-white" />
      </div>
    );
  }

  if (rank === 2) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary shadow-[0_4px_14px_rgba(21,133,122,0.3)]">
        <Medal className="h-4.5 w-4.5 text-white" />
      </div>
    );
  }

  if (rank === 3) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand shadow-[0_4px_14px_rgba(55,201,166,0.32)]">
        <Medal className="h-4.5 w-4.5 text-white" />
      </div>
    );
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/8 bg-foreground/4">
      <span className="text-[13px] font-bold text-foreground/50">{rank}</span>
    </div>
  );
}

function PodiumCard({
  entry,
  size,
}: {
  entry: LeaderboardEntry;
  size: "first" | "second" | "third";
}) {
  const heights = { first: "h-[130px]", second: "h-[104px]", third: "h-[88px]" };
  const avatarSizes = { first: "h-16 w-16 text-2xl", second: "h-13 w-13 text-xl", third: "h-12 w-12 text-lg" };
  const ringColors = {
    first: "ring-accent/60 shadow-[0_0_20px_rgba(242,132,58,0.25)]",
    second: "ring-primary/50",
    third: "ring-brand/55",
  };
  const pedestalColors = {
    first: "bg-[linear-gradient(180deg,rgba(242,132,58,0.18),rgba(242,132,58,0.06))]",
    second: "bg-[linear-gradient(180deg,rgba(21,133,122,0.16),rgba(21,133,122,0.05))]",
    third: "bg-[linear-gradient(180deg,rgba(55,201,166,0.16),rgba(55,201,166,0.05))]",
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <div
          className={cn(
            "flex items-center justify-center rounded-full ring-3",
            avatarSizes[size],
            ringColors[size],
            entry.isYou
              ? "bg-primary-strong text-white"
              : "bg-white",
          )}
        >
          {entry.isYou ? "You" : entry.avatar}
        </div>
        {size === "first" && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2">
            <Crown className="h-5 w-5 text-accent drop-shadow-[0_2px_4px_rgba(242,132,58,0.5)]" />
          </div>
        )}
      </div>
      <div className="text-center">
        <p className={cn("text-[12px] font-semibold leading-tight", entry.isYou ? "text-foreground" : "text-foreground/70")}>
          {entry.isYou ? "You" : entry.name}
        </p>
        <p className="mt-0.5 text-[11px] font-bold text-brand">{entry.points} pts</p>
      </div>
      <div className={cn("w-full rounded-t-[14px] border border-foreground/6", heights[size], pedestalColors[size])} />
    </div>
  );
}

export default function RankPage() {
  const { state, hydrated } = useDietFit();
  const [tab, setTab] = useState<"global" | "friends">("global");

  if (!hydrated || !state.profile) {
    return (
      <div className="px-4 pt-6">
        <div className="rounded-hero border border-foreground/7 bg-white p-6 text-center text-foreground/50 shadow-card">
          Complete onboarding to see your rank.
        </div>
      </div>
    );
  }

  const bracket = getWeightBracket(state.profile.weightKg);
  const userName = state.profile.name || "You";
  const userPoints = state.points;
  const userStreak = state.streak;
  const isUnlocked = userStreak >= 30;

  const seed = tab === "global" ? globalLeaderboardSeed : friendsLeaderboardSeed;
  const leaderboard = buildLeaderboard(seed, userName, userPoints, userStreak);


  return (
    <div className="min-h-screen pb-28 pt-0">
      <section className="relative overflow-hidden px-4 pb-5 pt-5 sm:px-5">
        {/* Background effects */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,_rgba(255,255,255,0.4),_transparent)]" />
        <div className="pointer-events-none absolute -right-12 top-20 h-36 w-36 rounded-full bg-white/34 blur-3xl" />

        <div className="relative">
          {/* Animated trophy + heading */}
          <div className="flex flex-col items-center pt-4 pb-2">
            <div className="relative">
              {/* Soft mint glow */}
              <div className="absolute inset-0 animate-[glow-pulse_2.4s_ease-in-out_infinite] rounded-full bg-brand/25 blur-2xl" />
              {/* Sparkle particles (warm + mint accents) */}
              <div className="absolute -left-3 top-1 h-2 w-2 animate-[sparkle_1.8s_ease-in-out_infinite] rounded-full bg-accent/70" />
              <div className="absolute -right-2 top-4 h-1.5 w-1.5 animate-[sparkle_2.2s_ease-in-out_0.6s_infinite] rounded-full bg-mint-medium/70" />
              <div className="absolute -right-4 -top-1 h-1 w-1 animate-[sparkle_1.6s_ease-in-out_1.1s_infinite] rounded-full bg-accent/55" />
              <div className="absolute -left-1 bottom-2 h-1.5 w-1.5 animate-[sparkle_2s_ease-in-out_0.3s_infinite] rounded-full bg-mint-medium/55" />
              {/* Trophy tile */}
              <div className="relative flex h-20 w-20 animate-[trophy-bounce_2.4s_ease-in-out_infinite] items-center justify-center rounded-hero bg-primary-strong shadow-[0_16px_36px_rgba(12,39,35,0.28)]">
                <Trophy className="h-9 w-9 text-mint-medium" />
              </div>
            </div>
            <h1 className="mt-4 text-[28px] font-semibold leading-none tracking-[-0.055em] text-foreground">
              Leaderboard
            </h1>
            <p className="mt-1.5 text-[12px] font-medium text-foreground/45">
              {bracket.label} weight category
            </p>
          </div>

          {/* Keyframe styles */}
          <style jsx>{`
            @keyframes trophy-bounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
            @keyframes glow-pulse {
              0%, 100% { opacity: 0.4; transform: scale(1); }
              50% { opacity: 0.8; transform: scale(1.15); }
            }
            @keyframes sparkle {
              0%, 100% { opacity: 0; transform: scale(0.5); }
              50% { opacity: 1; transform: scale(1.2); }
            }
          `}</style>

          {/* Tab toggle */}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-chip border px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition active:scale-[0.97]",
                tab === "global"
                  ? "border-foreground bg-primary-strong text-white shadow-[0_10px_20px_rgba(12,39,35,0.18)]"
                  : "border-foreground/8 bg-white text-foreground/60 shadow-[0_4px_12px_rgba(20,20,32,0.04)] hover:bg-white",
              )}
              onClick={() => setTab("global")}
            >
              <Trophy className="h-3.5 w-3.5" />
              Global
            </button>
            <button
              type="button"
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-chip border px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition active:scale-[0.97]",
                tab === "friends"
                  ? "border-foreground bg-primary-strong text-white shadow-[0_10px_20px_rgba(12,39,35,0.18)]"
                  : "border-foreground/8 bg-white text-foreground/60 shadow-[0_4px_12px_rgba(20,20,32,0.04)] hover:bg-white",
              )}
              onClick={() => setTab("friends")}
            >
              <Users className="h-3.5 w-3.5" />
              Friends
            </button>
          </div>

          {/* Leaderboard list */}
          <div className="relative mt-5">
            <div className="overflow-hidden rounded-card border border-foreground/7 bg-white shadow-card">
              {leaderboard.map((entry, index) => {
                const shouldBlur = !isUnlocked && !entry.isYou;

                return (
                  <div
                    key={entry.name}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 transition",
                      index !== leaderboard.length - 1 && "border-b border-black/[0.04]",
                      entry.isYou && "bg-[linear-gradient(90deg,rgba(55,201,166,0.12),rgba(255,255,255,0.3))]",
                    )}
                  >
                    <RankBadge rank={entry.rank} />
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-[15px]",
                      entry.isYou
                        ? "bg-primary-strong text-[11px] font-bold text-white"
                        : "bg-foreground/4 border border-foreground/8",
                      shouldBlur && "blur-[6px]",
                    )}>
                      {entry.isYou ? "You" : entry.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-[13px] font-semibold truncate",
                        entry.isYou ? "text-foreground" : "text-foreground/80",
                        shouldBlur && "blur-[6px] select-none",
                      )}>
                        {entry.isYou ? `${entry.name} (You)` : entry.name}
                      </p>
                      <div className={cn(
                        "flex items-center gap-2 mt-0.5",
                        shouldBlur && "blur-[6px] select-none",
                      )}>
                        <span className="text-[11px] font-medium text-foreground/45">
                          {entry.points} pts
                        </span>
                        <span className="flex items-center gap-0.5 text-[11px] font-medium text-accent">
                          <Flame className="h-3 w-3" />
                          {entry.streak}d
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Locked overlay */}
            {!isUnlocked && (
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center rounded-b-[22px] bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,252,0.85)_30%,rgba(255,255,252,0.97)_100%)] px-6 pb-6 pt-16">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-black/8 bg-white/80 shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
                  <Lock className="h-5 w-5 text-foreground/50" />
                </div>
                <p className="mt-3 text-center text-[15px] font-semibold text-foreground">
                  Unlock with a 30-day streak
                </p>
                <p className="mt-1 text-center text-[12px] text-foreground/45">
                  You&apos;re at {userStreak} {userStreak === 1 ? "day" : "days"}. Keep going!
                </p>
                <div className="mt-3 w-full max-w-[200px]">
                  <div className="h-2 overflow-hidden rounded-full bg-black/8">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand),var(--forest))] transition-all duration-500"
                      style={{ width: `${Math.min((userStreak / 30) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-center text-[10px] font-semibold text-foreground/35">
                    {userStreak}/30 days
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      </section>
    </div>
  );
}
