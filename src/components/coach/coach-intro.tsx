"use client";

import { Activity, Bot, Check, Flame, Target, TrendingDown, Utensils, X } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type SignalRow = {
  id: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  iconClass: string;
  iconFill?: string;
  delay: string;
};

// Same order and iconography the design handoff spells out for variant E.
const SIGNAL_ROWS: SignalRow[] = [
  { id: "meals", label: "Meals", icon: Utensils, iconClass: "text-primary", delay: "0s" },
  {
    id: "eating",
    label: "Eating patterns",
    icon: TrendingDown,
    iconClass: "text-[#F2843A]",
    delay: "0.35s",
  },
  { id: "workouts", label: "Workouts", icon: Activity, iconClass: "text-primary", delay: "0.7s" },
  { id: "coverage", label: "Muscle coverage", icon: Target, iconClass: "text-primary", delay: "1.05s" },
  {
    id: "challenges",
    label: "Challenges",
    icon: Flame,
    iconClass: "text-[#F2843A]",
    iconFill: "#F2843A",
    delay: "1.4s",
  },
];

const RISE_EASE = "cubic-bezier(.22,1,.36,1)";

type CoachIntroProps = {
  /** True when the user has never seen this screen — first-run vs a "What is this?" replay. */
  isFirstRun?: boolean;
  onDismiss: () => void;
};

export function CoachIntro({ isFirstRun = true, onDismiss }: CoachIntroProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#F5F1E8] text-foreground"
      style={{
        paddingTop: "var(--safe-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Your Personal Coach"
    >
      {/* Ambient orbs — behind everything, non-interactive. Two of them drift. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="coach-intro-decor absolute -right-[120px] -top-[160px] h-[400px] w-[400px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(92,215,185,.5), rgba(92,215,185,0) 66%)",
            filter: "blur(10px)",
            animation: "coach-intro-drift 12s ease-in-out infinite",
          }}
        />
        <div
          className="coach-intro-decor absolute -left-[150px] top-[240px] h-[340px] w-[340px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(242,132,58,.3), rgba(242,132,58,0) 66%)",
            filter: "blur(12px)",
            animation: "coach-intro-drift 14s ease-in-out 1s infinite",
          }}
        />
        <div
          className="coach-intro-decor absolute -bottom-[180px] -right-[70px] h-[400px] w-[400px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(21,133,122,.2), rgba(21,133,122,0) 68%)",
            filter: "blur(14px)",
          }}
        />
      </div>

      {/* Close button — top-right. Variant E stripped the "Skip" text link, but
          the handoff explicitly asks for a 36px ✕ to keep the screen
          dismissible when it runs as the first-run gate. */}
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/70 text-foreground/62 shadow-[0_6px_14px_rgba(12,39,35,0.08)] backdrop-blur-md transition active:scale-[0.96]"
        style={{ top: "calc(var(--safe-top) + 12px)" }}
        aria-label={isFirstRun ? "Skip intro" : "Close intro"}
      >
        <X className="h-4 w-4" />
      </button>

      {/* Content column */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-[22px] pb-[16px] pt-[54px]">
        {/* Headline + subhead */}
        <div
          className="coach-intro-motion mt-[10px]"
          style={{ animation: `coach-intro-rise 0.5s ${RISE_EASE} 0.06s both` }}
        >
          <h1
            className="font-display text-[34px] font-black leading-[1.03] tracking-[-0.04em] text-[#0E4B45]"
            style={{ textWrap: "pretty" }}
          >
            Your Personal Coach
          </h1>
          <p
            className="mt-[11px] max-w-[306px] text-[14px] leading-[1.5] text-[#56706B]"
            style={{ textWrap: "pretty" }}
          >
            Every reply you get here is personalized, based on what you actually eat, workouts
            you do, track muscle coverage, and challenges you crack.
          </p>
        </div>

        {/* Dark example-turn panel */}
        <div
          className="coach-intro-motion mt-[20px] overflow-hidden rounded-[26px] bg-[#0E4B45] p-[18px_16px] text-[#F5F1E8]"
          style={{
            boxShadow: "0 18px 38px rgba(14,75,69,.28)",
            animation: `coach-intro-rise 0.5s ${RISE_EASE} 0.18s both`,
          }}
        >
          <div className="flex flex-col gap-[9px]">
            {/* User bubble */}
            <div
              className="coach-intro-motion self-end rounded-[16px_16px_5px_16px] bg-[rgba(245,241,232,0.14)] px-[13px] py-[9px] text-[13px] leading-[1.35]"
              style={{
                maxWidth: 236,
                animation: "coach-intro-fadeq 7s ease infinite",
              }}
            >
              Why am I not losing weight?
            </div>

            {/* Coach reply row */}
            <div className="flex items-end gap-[9px] self-start">
              <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[#37C9A6]">
                <Bot className="h-[14px] w-[14px]" strokeWidth={2.4} color="#05221F" />
              </div>
              <div
                className="rounded-[16px_16px_16px_5px] bg-[#F5F1E8] px-[13px] py-[10px] text-[#0C2723]"
                style={{
                  width: 244,
                  boxShadow: "0 10px 22px rgba(5,34,31,.22)",
                }}
              >
                {/* Fixed-width reply; the three lines share a 7s cycle and are
                    revealed by width-only steps() typing per the design. */}
                <div
                  className="overflow-hidden whitespace-nowrap"
                  style={{ animation: "coach-intro-type1 7s steps(38,end) infinite" }}
                >
                  <span className="coach-intro-type text-[12.5px] leading-[1.5]">
                    You&apos;ve hit your calories 6 of 7 days,
                  </span>
                </div>
                <div
                  className="overflow-hidden whitespace-nowrap"
                  style={{ animation: "coach-intro-type2 7s steps(38,end) infinite" }}
                >
                  <span className="coach-intro-type text-[12.5px] leading-[1.5]">
                    but weekend logging drops off. Log
                  </span>
                </div>
                <div
                  className="overflow-hidden whitespace-nowrap"
                  style={{ animation: "coach-intro-type3 7s steps(38,end) infinite" }}
                >
                  <span className="coach-intro-type text-[12.5px] leading-[1.5]">
                    Sat dinner and we&apos;ll see the gap.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scan rows */}
        <div
          className="coach-intro-motion mt-[18px] flex flex-col gap-[7px]"
          style={{ animation: `coach-intro-rise 0.5s ${RISE_EASE} 0.26s both` }}
        >
          {SIGNAL_ROWS.map((row) => {
            const RowIcon = row.icon;
            return (
              <div
                key={row.id}
                className="coach-intro-motion flex items-center gap-[10px] rounded-[16px] border border-[rgba(231,224,209,0.9)] bg-white/72 px-[12px] py-[9px]"
                style={{
                  animation: `coach-intro-hl 7s ease-in-out ${row.delay} infinite`,
                }}
              >
                <RowIcon
                  className={`h-[18px] w-[18px] ${row.iconClass}`}
                  strokeWidth={2}
                  fill={row.iconFill ?? "none"}
                />
                <span className="font-display text-[13px] font-extrabold tracking-[-0.01em] text-[#0E4B45]">
                  {row.label}
                </span>
                <Check
                  className="coach-intro-motion ml-auto h-[15px] w-[15px] text-[#37C9A6]"
                  strokeWidth={3.4}
                  style={{
                    animation: `coach-intro-tick 7s ease ${row.delay} infinite`,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Spacer pushes the CTA to the bottom without hardcoding an offset. */}
        <div className="min-h-[12px] flex-1" />

        {/* Primary CTA */}
        <button
          type="button"
          onClick={onDismiss}
          className="coach-intro-motion flex h-[54px] w-full items-center justify-center rounded-full bg-primary font-display text-[16.5px] font-extrabold tracking-[-0.01em] text-[#F5F1E8] transition active:scale-[0.975] hover:bg-primary-strong"
          style={{
            boxShadow: "0 14px 30px rgba(21,133,122,.32)",
            animation: `coach-intro-rise 0.5s ${RISE_EASE} 0.42s both`,
          }}
        >
          Start chatting
        </button>
      </div>
    </div>
  );
}
