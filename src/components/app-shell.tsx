"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Dumbbell, Flame, MessageCircle, Salad } from "lucide-react";
import { cn } from "@/lib/utils";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { hasFirebaseEnv } from "@/lib/env";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { DailyReadinessCheckIn } from "@/components/workout/daily-readiness-check-in";
import { GoalWrapUp } from "@/components/goal/goal-wrap-up";
import { CelebrationToast } from "@/components/celebration/celebration-toast";
import { StreakMilestone } from "@/components/celebration/streak-milestone";
import { ComebackCompleted } from "@/components/celebration/comeback-completed";
import { NutritionDayCompleted } from "@/components/celebration/nutrition-day";
import { DayFullyLogged } from "@/components/diet/day-fully-logged";

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const navItems = [
  { href: "/workout", label: "Workout", icon: Dumbbell },
  { href: "/diet", label: "Diet", icon: Salad },
  { href: "/ai-chat", label: "Coach", icon: MessageCircle },
  { href: "/challenges", label: "Challenges", icon: Flame },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    state: { streak, points, profile },
  } = useDietFit();
  const isWorkoutHome = pathname.startsWith("/workout");
  const isChallengesPage = pathname.startsWith("/challenges");
  const isDietPage = pathname.startsWith("/diet");
  const isCoachPage = pathname.startsWith("/ai-chat");
  // The nav is pinned to the viewport bottom, which sits under the keyboard while
  // typing. Native apps get out of the way instead.
  const { isOpen: keyboardIsOpen } = useKeyboardInset();
  const isProfilePage = pathname.startsWith("/profile");
  const isTrainerCallPage = pathname.startsWith("/coach-on-demand");
  const hideBottomNav =
    pathname.startsWith("/workout/exercise") || pathname.startsWith("/workout/history");
  const hasCustomHeader =
    isWorkoutHome ||
    isChallengesPage ||
    isDietPage ||
    isCoachPage ||
    isProfilePage ||
    isTrainerCallPage;

  return (
    <>
      {hasCustomHeader && (
        <div
          className="app-ground fixed inset-0 -z-10"
        />
      )}

      {isChallengesPage && profile && (
        <Link
          href="/profile"
          className="glass fixed right-4 z-40 flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 transition active:scale-[0.96]"
          style={{ top: "max(1rem, var(--safe-top))" }}
          aria-label="Go to profile"
        >
          <div className="glass-dark-inset flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold">
            {initials(profile.name)}
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-foreground/40" />
        </Link>
      )}
      <div
        className={cn(
          "page-shell flex min-h-screen flex-col py-4",
          hasCustomHeader && "w-full max-w-[460px] py-0 md:max-w-[780px]",
        )}
      >
        {!hasCustomHeader ? (
          <header className="glass-panel mb-4 rounded-hero p-4">
            <div className={cn("flex justify-between gap-4", isDietPage ? "items-center" : "items-start")}>
              <div>
                {isDietPage ? (
                  <h1 className="text-2xl font-semibold">Nutrition tracking</h1>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/75">
                      Fitmonk
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold">Your guided fitness rhythm</h1>
                    <p className="mt-2 max-w-xl text-sm text-muted">
                      {hasFirebaseEnv()
                        ? "Firebase Auth is connected, so Google sign-in is ready for this experience."
                        : "Running in demo-ready local mode. Add Firebase env values to switch on Google sign-in."}
                    </p>
                  </>
                )}
              </div>
              <div className="grid min-w-[140px] gap-2 text-sm">
                <div className="rounded-2xl bg-primary/8 px-3 py-2">
                  <div className="text-muted">Streak</div>
                  <div className="text-lg font-semibold text-primary">{streak} days</div>
                </div>
                <div className="rounded-2xl bg-accent-soft px-3 py-2">
                  <div className="text-muted">Points</div>
                  <div className="text-lg font-semibold text-accent">{points}</div>
                </div>
              </div>
            </div>
          </header>
        ) : null}

        <main
          className={cn(
            "flex-1",
            isCoachPage
              ? "overflow-hidden pb-0"
              : "pb-[calc(var(--screen-pad-bottom)+6rem)]",
          )}
        >
          {children}
        </main>

        {/* Nav is z-30: above page content that sets its own z-index (the
            workout timeline rings are z-[1], some cards z-20), below dialogs
            and sheets (z-40/z-50), which should still cover it. */}
        {!hideBottomNav && !keyboardIsOpen ? (
          <nav
            className="glass glass-ui fixed inset-x-3 z-30 mx-auto flex max-w-xl justify-between gap-1 rounded-full p-1.5"
            style={{ bottom: "max(16px, calc(env(safe-area-inset-bottom) + 6px))" }}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/workout"
                  ? pathname.startsWith(item.href)
                  : pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-full px-3 py-2 text-[11px] font-medium transition",
                    active
                      ? "glass-dark-inset"
                      : "text-foreground/60 hover:bg-white/50 hover:text-foreground",
                  )}
                >
                  {/* Color on inner nodes, not the <a>: Tailwind v4's unlayered
                      `a { color: inherit }` rule beats a text-white utility on
                      the anchor itself. */}
                  <Icon className={cn("h-4 w-4", active && "text-white")} />
                  <span className={cn(active && "text-white")}>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
      <DailyReadinessCheckIn />
      <GoalWrapUp />
      <CelebrationToast />
      <StreakMilestone />
      <ComebackCompleted />
      <NutritionDayCompleted />
      <DayFullyLogged />
    </>
  );
}
