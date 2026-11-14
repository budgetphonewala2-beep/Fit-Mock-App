"use client";

import { useState } from "react";
import {
  parseScopedCelebrationCode,
  scopedCelebrationCode,
} from "@/lib/achievements";
import { nativeBridge } from "@/lib/native-bridge";
import {
  STREAK_MILESTONE_COPY,
  streakReceipts,
  streakRunStats,
  streakTierFor,
  type StreakStat,
  type StreakTier,
} from "@/lib/streak-milestones";
import { renderStreakShareCard } from "@/lib/share-cards";
import { streakShareText } from "@/lib/share-text";
import { useDietFit } from "@/components/providers/dietfit-provider";

const EXIT_MS = 280;

type TierVisuals = {
  stage: string;
  ink: string;
  /** Pill tint, medallion gradient, CTA fill and ring colour all key off this. */
  accent: string;
  pillText: string;
  medallionGradient: string;
  medallion: number;
  numberSize: number;
  rings: { diameter: number; duration: string }[];
  warmGlow: string;
  coolGlow: string;
  glowTop: number;
  glowBottom: number;
  ctaFill: string;
  ctaInk: string;
  /** Day 14 and 30 send a dot round the medallion; earlier tiers do not. */
  orbits: { color: string; duration: string; offset: number }[];
  sparks: { left: number; size: number; color: string; duration: string; delay: string; rise: number }[];
  mark: "flame" | "star";
};

const RING_DURATIONS = { standard: "2.8s", elite: "3s" };

function visualsFor(days: number): TierVisuals {
  const tier: StreakTier = streakTierFor(days);

  const shared = {
    ink: "var(--ink)",
    glowTop: -130,
    glowBottom: -190,
    mark: "flame" as const,
    orbits: [] as TierVisuals["orbits"],
  };

  if (tier === "elite") {
    return {
      ...shared,
      stage: "var(--teal-deep)",
      ink: "var(--teal-deep)",
      accent: "var(--brand)",
      pillText: "var(--mint-light)",
      medallionGradient:
        "linear-gradient(150deg,#37C9A6,#0E9E86 55%,#FFD24A)",
      medallion: 180,
      numberSize: 84,
      rings: [
        { diameter: 224, duration: RING_DURATIONS.elite },
        { diameter: 224, duration: RING_DURATIONS.elite },
        { diameter: 224, duration: RING_DURATIONS.elite },
      ],
      warmGlow: "rgba(55,201,166,.42)",
      coolGlow: "rgba(255,210,74,.26)",
      glowTop: -140,
      glowBottom: -200,
      ctaFill: "var(--brand)",
      ctaInk: "var(--teal-deep)",
      mark: "star",
      orbits: [
        { color: "var(--brand)", duration: "11s", offset: 0 },
        { color: "var(--gold-500)", duration: "11s", offset: 180 },
      ],
      sparks: [
        { left: 54, size: 7, color: "var(--brand)", duration: "3.1s", delay: "0.2s", rise: -220 },
        { left: 132, size: 5, color: "var(--gold-500)", duration: "2.7s", delay: "1.1s", rise: -210 },
        { left: 248, size: 9, color: "var(--cream)", duration: "3.3s", delay: "0.6s", rise: -230 },
        { left: 322, size: 6, color: "var(--brand)", duration: "2.9s", delay: "1.6s", rise: -215 },
      ],
    };
  }

  if (tier === "gold") {
    return {
      ...shared,
      stage: "var(--teal-stage)",
      accent: "var(--gold-500)",
      pillText: "var(--gold-300)",
      medallionGradient: "linear-gradient(150deg,#FFD24A,#F2843A)",
      medallion: 166,
      numberSize: 78,
      rings: [
        { diameter: 210, duration: RING_DURATIONS.standard },
        { diameter: 210, duration: RING_DURATIONS.standard },
        { diameter: 210, duration: RING_DURATIONS.standard },
      ],
      warmGlow: "rgba(255,210,74,.44)",
      coolGlow: "rgba(55,201,166,.34)",
      ctaFill: "var(--gold-500)",
      ctaInk: "var(--ink)",
      orbits: [{ color: "var(--gold-500)", duration: "9s", offset: 0 }],
      sparks: [
        { left: 62, size: 6, color: "var(--gold-500)", duration: "2.9s", delay: "0.3s", rise: -215 },
        { left: 196, size: 8, color: "var(--orange-light)", duration: "3.2s", delay: "1.2s", rise: -225 },
        { left: 316, size: 5, color: "var(--cream)", duration: "2.6s", delay: "0.8s", rise: -210 },
      ],
    };
  }

  const ember = tier === "ember";

  return {
    ...shared,
    stage: "var(--teal-stage)",
    accent: "var(--accent)",
    pillText: "var(--orange-light)",
    medallionGradient: "linear-gradient(150deg,#FFB03A,#E2612B)",
    medallion: ember ? 158 : 150,
    numberSize: ember ? 80 : 74,
    rings: [
      { diameter: 200, duration: RING_DURATIONS.standard },
      { diameter: 200, duration: RING_DURATIONS.standard },
    ],
    warmGlow: "rgba(242,132,58,.55)",
    coolGlow: "rgba(55,201,166,.38)",
    ctaFill: "var(--accent)",
    ctaInk: "var(--ink)",
    sparks: ember
      ? [
          { left: 78, size: 6, color: "var(--accent)", duration: "2.8s", delay: "0.4s", rise: -215 },
          { left: 290, size: 8, color: "var(--orange-light)", duration: "3.1s", delay: "1.3s", rise: -225 },
        ]
      : [
          { left: 48, size: 6, color: "var(--accent)", duration: "2.5s", delay: "0.2s", rise: -210 },
          { left: 148, size: 5, color: "var(--orange-light)", duration: "3s", delay: "1.1s", rise: -220 },
          { left: 262, size: 8, color: "var(--cream)", duration: "3.3s", delay: "0.7s", rise: -230 },
          { left: 336, size: 6, color: "var(--accent)", duration: "2.8s", delay: "1.6s", rise: -215 },
        ],
  };
}

function FlameGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M12 2c.6 3.2-1.2 4.6-2.6 6C7.8 9.6 6 11.2 6 14a6 6 0 0 0 12 0c0-2.4-1.1-4-2.3-5.4-.5 1-1.2 1.7-2 2 .6-2.6-.4-6.3-1.7-8.6Z" />
    </svg>
  );
}

function StarGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z" />
    </svg>
  );
}

function CheckGlyph({ size, color, stroke }: { size: number; color: string; stroke: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 12.6 9.2 17.3 19.6 6.6" />
    </svg>
  );
}

/**
 * The streak milestone takeover: day 3, 7, 14, 30 and the elite repeats.
 *
 * One shell for every rung. Only the tier colour, ring weight, copy and proof
 * block change -- layout, type scale and motion are identical, which is what
 * makes the ladder read as an escalation rather than four unrelated screens.
 *
 * Unlike the toast it never auto-advances: a milestone is earned, so it waits
 * for a tap.
 */
export function StreakMilestone() {
  const { state, currentCelebration, dismissCelebration } = useDietFit();
  const [exiting, setExiting] = useState(false);

  const parsed = currentCelebration ? parseScopedCelebrationCode(currentCelebration.code) : null;
  const milestone =
    currentCelebration?.tier === "takeover" && parsed?.code.startsWith("streak-")
      ? Number(parsed.code.slice("streak-".length))
      : null;

  if (milestone === null || !parsed || !STREAK_MILESTONE_COPY[milestone]) {
    return null;
  }

  const runStart = parsed.scopeKey;
  const copy = STREAK_MILESTONE_COPY[milestone];
  const visuals = visualsFor(milestone);
  const tier = streakTierFor(milestone);
  const showsTiles = milestone <= 7;
  const receipts = showsTiles
    ? streakReceipts({ milestone, runStart, short: milestone === 7 })
    : [];
  const stats: StreakStat[] =
    tier === "elite"
      ? streakRunStats({
          streak: milestone,
          runStart,
          workoutLogs: state.workoutLogs,
          workoutLoadLogs: state.workoutLoadLogs,
        })
      : [];

  function dismiss() {
    setExiting(true);
    window.setTimeout(() => {
      setExiting(false);
      dismissCelebration();
    }, EXIT_MS);
  }

  const days = milestone;
  async function share() {
    const text = streakShareText(days);
    const subject = "Streak unlocked | Fitmonk";

    // Try to render the card and share it as an image; fall back to a text
    // share if canvas fails (older WebView, offscreen render fault, etc.). We
    // never want a broken canvas to eat the whole share intent.
    try {
      const image = await renderStreakShareCard({
        days,
        userName: state.profile?.name?.split(" ")[0],
      });
      await nativeBridge.device.shareImage({
        text,
        subject,
        image,
        filename: `fitmonk-streak-${days}`,
      });
    } catch {
      await nativeBridge.device.share({ text, subject }).catch(() => null);
    }

    dismiss();
  }

  const spoken = [
    "Streak unlocked.",
    copy.headline.replace("\n", " ") + ".",
    copy.support ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={spoken}
      className="fixed inset-0 z-[70] overflow-hidden"
      style={{
        background: visuals.stage,
        color: "var(--cream)",
        animation: exiting
          ? `fm-fade-out ${EXIT_MS}ms ease-out both`
          : "fm-fade-in 260ms ease-out both",
      }}
    >
      {/* Glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 h-[540px] w-[540px] -translate-x-1/2 rounded-full blur-[6px]"
        style={{
          top: visuals.glowTop,
          background: `radial-gradient(circle,${visuals.warmGlow},transparent 62%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full"
        style={{
          bottom: visuals.glowBottom,
          background: `radial-gradient(circle,${visuals.coolGlow},transparent 64%)`,
        }}
      />

      {/* Burst rings — count and duration are the escalation signal. */}
      {visuals.rings.map((ring, index) => (
        <div
          key={index}
          aria-hidden
          className="sm-decor pointer-events-none absolute left-1/2 top-[42%] rounded-full border-2"
          style={{
            width: ring.diameter,
            height: ring.diameter,
            marginLeft: -ring.diameter / 2,
            marginTop: -ring.diameter / 2,
            borderColor: visuals.accent,
            opacity: 0.55,
            animation: `fm-ring ${ring.duration} cubic-bezier(.2,.7,.3,1) ${index * 0.9}s infinite`,
          }}
        />
      ))}

      {/* Rising sparks */}
      <div aria-hidden className="pointer-events-none absolute inset-0 mx-auto max-w-[393px]">
        {visuals.sparks.map((spark) => (
          <div
            key={spark.left}
            className="sm-decor absolute rounded-full"
            style={
              {
                left: spark.left,
                bottom: "26%",
                width: spark.size,
                height: spark.size,
                background: spark.color,
                "--sm-spark-rise": `${spark.rise}px`,
                animation: `sm-spark ${spark.duration} ease-out ${spark.delay} infinite`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Close */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="sm-motion absolute z-20 flex h-11 w-11 items-center justify-center rounded-full"
        style={{
          top: "max(54px, calc(var(--safe-top) + 18px))",
          right: 18,
          background: "rgba(245,241,232,.1)",
          animation: "fm-rise .5s ease 1.5s both",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="rgba(245,241,232,.7)"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Content */}
      <div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center px-[30px] text-center"
        style={{ paddingBottom: "calc(150px + env(safe-area-inset-bottom))" }}
      >
        <div
          className="sm-motion inline-flex flex-none items-center rounded-full border px-4 py-2 font-display text-[12px] font-extrabold tracking-[0.14em]"
          style={{
            background: `color-mix(in srgb, ${visuals.accent} 16%, transparent)`,
            borderColor: `color-mix(in srgb, ${visuals.accent} 46%, transparent)`,
            color: visuals.pillText,
            animation: "fm-pop .5s cubic-bezier(.2,.9,.3,1.4) both",
          }}
        >
          STREAK UNLOCKED
        </div>

        {/* Medallion */}
        <div
          className="sm-motion relative mt-[30px] flex-none"
          style={{
            width: visuals.medallion,
            height: visuals.medallion,
            animation: "fm-pop .6s cubic-bezier(.2,.9,.3,1.3) .1s both",
          }}
        >
          <div
            className="sm-motion absolute inset-0 flex items-center justify-center overflow-hidden rounded-full"
            style={{
              background: visuals.medallionGradient,
              boxShadow: `0 24px 58px color-mix(in srgb, ${visuals.accent} 45%, transparent)`,
              animation: "sm-flicker 2.3s ease-in-out infinite",
            }}
          >
            <span
              className="font-display font-black tabular-nums"
              style={{
                fontSize: visuals.numberSize,
                lineHeight: 0.8,
                letterSpacing: "-0.05em",
                color: visuals.ink,
              }}
            >
              {milestone}
            </span>
            <div
              aria-hidden
              className="sm-decor absolute left-0 top-0 h-full w-[38%]"
              style={{
                background:
                  "linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.48),rgba(255,255,255,0))",
                animation: "fm-shine 3.1s ease-in-out 1.2s infinite",
              }}
            />
          </div>

          {/* Orbiting spark(s) */}
          {visuals.orbits.map((orbit) => (
            <div
              key={orbit.offset}
              aria-hidden
              className="sm-decor absolute inset-[-14px]"
              style={{
                animation: `sm-orbit ${orbit.duration} linear infinite`,
                transform: `rotate(${orbit.offset}deg)`,
              }}
            >
              <div
                className="absolute left-1/2 top-0 h-[9px] w-[9px] -translate-x-1/2 rounded-full"
                style={{ background: orbit.color }}
              />
            </div>
          ))}

          {/* Tier mark */}
          <div
            className="sm-motion absolute flex items-center justify-center rounded-full"
            style={{
              width: 44,
              height: 44,
              right: -2,
              top: 2,
              background: visuals.stage,
              border: "3px solid var(--gold-500)",
              animation: "sm-ignite .7s cubic-bezier(.2,.9,.3,1.5) .5s both",
            }}
          >
            {visuals.mark === "star" ? (
              <StarGlyph size={20} color="var(--gold-500)" />
            ) : (
              <FlameGlyph size={20} color="var(--gold-500)" />
            )}
          </div>
        </div>

        <h2
          className="sm-motion mt-[26px] flex-none whitespace-pre-line font-display font-black uppercase"
          style={{
            fontSize: 42,
            lineHeight: 0.98,
            letterSpacing: "-0.035em",
            animation: "fm-rise .55s cubic-bezier(.2,.8,.3,1) .3s both",
          }}
        >
          {copy.headline}
        </h2>

        {/* Proof block */}
        {showsTiles && (
          <div
            className="sm-motion mt-[34px] flex flex-none justify-center"
            style={{
              gap: milestone === 7 ? 8 : 10,
              animation: "fm-rise .5s cubic-bezier(.2,.8,.3,1) .55s both",
            }}
          >
            {receipts.map((receipt, index) =>
              milestone === 7 ? (
                <div
                  key={index}
                  className="flex flex-col items-center justify-center rounded-[12px]"
                  style={{
                    width: 36,
                    height: 44,
                    background: "rgba(242,132,58,.18)",
                    border: "1px solid rgba(242,132,58,.5)",
                  }}
                >
                  <span
                    className="font-display text-[10px] font-extrabold"
                    style={{ color: "var(--orange-light)" }}
                  >
                    {receipt.label}
                  </span>
                  <CheckGlyph size={13} color="var(--accent)" stroke={3.4} />
                </div>
              ) : (
                <div
                  key={index}
                  className={receipt.isToday ? "sm-motion" : undefined}
                  style={{
                    width: 74,
                    borderRadius: 18,
                    padding: "12px 11px",
                    background: receipt.isToday
                      ? "rgba(242,132,58,.18)"
                      : "rgba(245,241,232,.07)",
                    border: receipt.isToday
                      ? "2px solid var(--accent)"
                      : "1px solid rgba(245,241,232,.12)",
                    animation: receipt.isToday
                      ? "sm-ignite .7s cubic-bezier(.2,.9,.3,1.5) .72s both"
                      : undefined,
                  }}
                >
                  <div
                    className="font-display text-[11px] font-bold tracking-[0.12em]"
                    style={{ color: receipt.isToday ? "var(--orange-light)" : "rgba(245,241,232,.5)" }}
                  >
                    {receipt.label}
                  </div>
                  <div
                    className="mx-auto mt-2 flex h-[30px] w-[30px] items-center justify-center rounded-full"
                    style={{
                      background: receipt.isToday ? "var(--accent)" : "rgba(55,201,166,.9)",
                    }}
                  >
                    {receipt.isToday ? (
                      <FlameGlyph size={15} color="var(--ink)" />
                    ) : (
                      <CheckGlyph size={15} color="var(--ink)" stroke={3.2} />
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        {copy.support && (
          <p
            className="sm-motion mt-4 max-w-[300px] flex-none text-[16px] leading-[1.45]"
            style={{
              color: "rgba(245,241,232,.62)",
              animation: "fm-rise .5s ease .58s both",
            }}
          >
            {copy.support}
          </p>
        )}

        {stats.length > 0 && (
          <div
            className="sm-motion mt-8 flex flex-none justify-center gap-[10px]"
            style={{ animation: "fm-rise .5s ease .7s both" }}
          >
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className="rounded-chip px-4 py-[10px]"
                style={{
                  background: "rgba(245,241,232,.07)",
                  border: "1px solid rgba(245,241,232,.12)",
                }}
              >
                <div
                  className="font-display text-[20px] font-black tabular-nums"
                  style={{ color: index === 0 ? "var(--brand)" : "var(--gold-500)" }}
                >
                  {stat.value}
                </div>
                <div
                  className="mt-1 text-[11px] font-semibold tracking-[0.06em]"
                  style={{ color: "rgba(245,241,232,.5)" }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA — the only button on the screen. */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 px-6"
        style={{ paddingBottom: "calc(30px + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={share}
          className="sm-motion mx-auto block w-full max-w-[322px] rounded-full font-display text-[17px] font-extrabold transition active:scale-[0.98]"
          style={{
            height: 56,
            background: visuals.ctaFill,
            color: visuals.ctaInk,
            boxShadow: `0 14px 30px color-mix(in srgb, ${visuals.ctaFill} 38%, transparent)`,
            animation: "fm-rise .5s cubic-bezier(.2,.8,.3,1) .82s both",
          }}
        >
          Share my streak
        </button>
      </div>
    </div>
  );
}

/** Exported for the provider's renderer registry and for tests. */
export function streakMilestoneCode(days: number, runStart: string) {
  return scopedCelebrationCode(`streak-${days}`, runStart);
}
