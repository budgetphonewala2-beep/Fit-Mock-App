"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronRight, Zap } from "lucide-react";

const RING_CIRCUMFERENCE = 94.2; // 2πr, r = 15
const COUNT_UP_START = 0.5; // seconds into the sequence
const COUNT_UP_DURATION = 1.6;
const EXIT_MS = 280;

// Prototype placeholder avatars — swap for real participant photos by passing
// `avatarUrls`. The 2px background-coloured border is what cuts them apart.
const PLACEHOLDER_AVATARS = [
  "repeating-linear-gradient(135deg,#2D6A60,#2D6A60 4px,#255A52 4px,#255A52 8px)",
  "repeating-linear-gradient(135deg,#3C7C70,#3C7C70 4px,#316A60 4px,#316A60 8px)",
  "repeating-linear-gradient(135deg,#4B8E80,#4B8E80 4px,#3F7C70 4px,#3F7C70 8px)",
];

/** 422000 → "422K+", 12500 → "12.5K+", 892 → "892". */
export function formatMemberCount(n: number) {
  if (n < 1000) return String(n);
  const k = (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "");
  return `${k}K+`;
}

/** Spoken as one sentence, so the screen lands as a single announcement. */
function announcement(title: string, subtitle: string, memberCount: number) {
  return `Challenge unlocked. ${title}. ${subtitle} ${memberCount.toLocaleString()} people training with you.`;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Read through useSyncExternalStore rather than an effect, so the very first
// client render already knows — there is no animated frame to un-animate.
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

export function ChallengeIntro({
  title,
  subtitle,
  memberCount,
  icon: Icon = Zap,
  avatarUrls,
  durationSeconds = 3.5,
  ctaLabel = "I'm ready to join",
  onCta,
  onDone,
}: {
  title: string;
  subtitle: string;
  memberCount: number;
  icon?: React.ElementType;
  avatarUrls?: string[];
  /**
   * Configurable 2–6s. The count-up settles at 2.1s, so a shorter hold cuts
   * the social-proof number off almost as soon as it lands.
   */
  durationSeconds?: number;
  ctaLabel?: string;
  /** Fired by the footer cue before dismissal; omit for a plain skip. */
  onCta?: () => void;
  onDone: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const [exiting, setExiting] = useState(false);
  const dismissed = useRef(false);

  // The intro owns the whole viewport, so the page behind it must not scroll —
  // otherwise its scrollbar shows as a gutter down the edge of the overlay.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // One dismissal path for the timer, the tap and the footer cue, so the exit
  // cross-fade can never be started twice.
  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(onDone, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting, onDone]);

  useEffect(() => {
    let frame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const seconds = (now - startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= durationSeconds) {
        if (!dismissed.current) {
          dismissed.current = true;
          setExiting(true);
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationSeconds]);

  function dismiss(runCta = false) {
    if (dismissed.current) return;
    dismissed.current = true;
    if (runCta) onCta?.();
    setExiting(true);
  }

  const progress = Math.min(elapsed / durationSeconds, 1);
  // Capped at the whole-second floor so a fractional duration doesn't open on a
  // number it holds for a sliver — 3.5s reads 3, 2, 1, with 3 held longest.
  const secondsLeft = Math.max(
    1,
    Math.min(Math.floor(durationSeconds), Math.ceil(durationSeconds - elapsed)),
  );

  // easeOutCubic over the count-up window; reduced motion shows the final value.
  const countProgress = reducedMotion
    ? 1
    : 1 - Math.pow(1 - Math.min(Math.max((elapsed - COUNT_UP_START) / COUNT_UP_DURATION, 0), 1), 3);
  const countLabel = formatMemberCount(Math.round(memberCount * countProgress));

  const avatars = avatarUrls?.slice(0, 3) ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={announcement(title, subtitle, memberCount)}
      onClick={() => dismiss()}
      className="fixed inset-0 z-[60] overflow-hidden bg-teal-stage text-background"
      style={{
        animation: exiting
          ? `ci-fade-out ${EXIT_MS}ms ease-out both`
          : `ci-fade-in ${reducedMotion ? 200 : 260}ms ease-out both`,
      }}
    >
      {/* Background glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-140px] h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-[6px]"
        style={{ background: "radial-gradient(circle,rgba(242,132,58,.55),rgba(242,132,58,0) 62%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-180px] left-1/2 h-[460px] w-[460px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle,rgba(55,201,166,.4),rgba(55,201,166,0) 64%)" }}
      />

      {/* Layer 1 — burst rings */}
      {[
        { border: "rgba(242,132,58,.6)", delay: "0.05s" },
        { border: "rgba(55,201,166,.55)", delay: "0.5s" },
        { border: "rgba(245,241,232,.3)", delay: "0.95s" },
      ].map((ring) => (
        <div
          key={ring.delay}
          aria-hidden
          className="ci-decor pointer-events-none absolute left-1/2 top-[35%] -ml-[110px] -mt-[110px] h-[220px] w-[220px] rounded-full border-2"
          style={{
            borderColor: ring.border,
            animation: `ci-ring 2.6s cubic-bezier(.2,.7,.3,1) ${ring.delay} infinite`,
          }}
        />
      ))}

      {/* Layer 2 — rising sparks. Held to a phone-width stage so they stay in
          the composition on wider viewports. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 mx-auto max-w-[393px]">
        {[
          { size: 8, left: 58, bottom: 180, color: "var(--accent)", duration: "2.4s", delay: "0.2s", opacity: 1 },
          { size: 6, left: 150, bottom: 150, color: "var(--brand)", duration: "2.8s", delay: "0.9s", opacity: 1 },
          { size: 9, right: 74, bottom: 170, color: "#FFD24A", duration: "2.6s", delay: "1.4s", opacity: 1 },
          { size: 5, right: 140, bottom: 130, color: "var(--background)", duration: "3s", delay: "0.55s", opacity: 0.7 },
        ].map((spark, index) => (
          <div
            key={index}
            className="ci-decor absolute rounded-full"
            style={{
              width: spark.size,
              height: spark.size,
              left: spark.left,
              right: spark.right,
              bottom: spark.bottom,
              background: spark.color,
              opacity: spark.opacity,
              animation: `ci-spark ${spark.duration} ease-out ${spark.delay} infinite`,
            }}
          />
        ))}
      </div>

      {/* Layer 4 — skip control */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          dismiss();
        }}
        className="absolute right-[22px] z-20 flex items-center gap-2 rounded-full py-1 pl-2 transition active:scale-[0.96]"
        style={{ top: "calc(1rem + var(--safe-top))" }}
      >
        <span className="text-[13px] font-semibold text-[rgba(245,241,232,0.5)]">Skip</span>
        <span className="relative h-[34px] w-[34px]">
          <svg width="34" height="34" viewBox="0 0 34 34" className="-rotate-90" aria-hidden>
            <circle cx="17" cy="17" r="15" fill="none" stroke="rgba(245,241,232,.16)" strokeWidth="2.5" />
            <circle
              cx="17"
              cy="17"
              r="15"
              fill="none"
              stroke="#f2843a"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * progress}
            />
          </svg>
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center font-display text-[12px] font-extrabold text-background"
          >
            {secondsLeft}
          </span>
        </span>
      </button>

      {/* Layer 5 — content stack */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-[34px] text-center">
        <div
          className="ci-motion inline-flex items-center gap-2 rounded-full border border-[rgba(242,132,58,0.4)] bg-[rgba(242,132,58,0.16)] px-4 py-2 font-display text-[12px] font-extrabold tracking-[0.14em] text-orange-light"
          style={{ animation: "ci-pop .5s cubic-bezier(.2,.9,.3,1.4) both" }}
        >
          CHALLENGE UNLOCKED
        </div>

        <div
          className="ci-motion relative mt-[34px]"
          style={{ animation: "ci-pop .6s cubic-bezier(.2,.9,.3,1.3) .12s both" }}
        >
          <div
            className="ci-motion flex h-[132px] w-[132px] items-center justify-center rounded-full shadow-[0_22px_54px_rgba(242,132,58,0.45)]"
            style={{
              background: "linear-gradient(150deg,var(--accent),#E2612B)",
              animation: "ci-breathe 2.4s ease-in-out infinite",
            }}
          >
            <Icon className="h-[60px] w-[60px]" fill="#0c2723" stroke="#0c2723" strokeWidth={1.5} />
          </div>
          {/* Shine sweep, clipped to the medallion */}
          <div aria-hidden className="ci-decor absolute inset-0 overflow-hidden rounded-full">
            <div
              className="absolute left-0 top-0 h-full w-[38%]"
              style={{
                background:
                  "linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.5),rgba(255,255,255,0))",
                animation: "ci-shine 2.6s ease-in-out 1s infinite",
              }}
            />
          </div>
        </div>

        <p
          className="ci-motion mt-8 font-display text-[44px] font-black uppercase leading-[0.98] tracking-[-0.035em]"
          style={{ animation: "ci-rise .55s cubic-bezier(.2,.8,.3,1) .28s both" }}
        >
          {title}
        </p>
        <p
          className="ci-motion mt-3.5 max-w-[300px] text-[16px] leading-[1.45] text-[rgba(245,241,232,0.72)]"
          style={{ animation: "ci-rise .55s cubic-bezier(.2,.8,.3,1) .4s both" }}
        >
          {subtitle}
        </p>

        <div
          className="ci-motion mt-[38px] flex items-center gap-3 rounded-full border border-[rgba(245,241,232,0.1)] bg-[rgba(245,241,232,0.07)] py-2.5 pl-2.5 pr-[18px]"
          style={{ animation: "ci-rise .55s cubic-bezier(.2,.8,.3,1) .52s both" }}
        >
          <div aria-hidden className="flex">
            {PLACEHOLDER_AVATARS.map((stripes, index) => (
              <span
                key={index}
                className="h-8 w-8 rounded-full border-2 border-teal-stage bg-cover bg-center [&:not(:first-child)]:-ml-3"
                style={
                  avatars[index]
                    ? { backgroundImage: `url(${avatars[index]})` }
                    : { background: stripes }
                }
              />
            ))}
          </div>
          <div aria-hidden className="text-left">
            <p className="font-display text-[20px] font-black tracking-[-0.02em] text-brand tabular-nums">
              {countLabel}
            </p>
            <p className="text-[12px] font-semibold tracking-[0.04em] text-[rgba(245,241,232,0.55)]">
              people training with you
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            dismiss(true);
          }}
          className="ci-motion mt-[46px] flex min-h-[44px] items-center gap-2 px-4 text-[14px] font-semibold text-[rgba(245,241,232,0.45)] transition active:scale-[0.97]"
          style={{ animation: "ci-rise .5s ease .9s both" }}
        >
          {ctaLabel}
          <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
