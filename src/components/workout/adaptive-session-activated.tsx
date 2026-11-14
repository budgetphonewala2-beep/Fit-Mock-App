"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

const RISE_EASE = "cubic-bezier(.22,1,.36,1)";
const RING_EASE = "cubic-bezier(.16,.84,.3,1)";

const HOLD_MS = 3000;
const CROSSFADE_MS = 400;

type AdaptiveSessionActivatedProps = {
  /** Fires after the 3s hold + 400ms crossfade completes, OR after the same
   * crossfade following a tap / hardware-back fast-forward. */
  onComplete: () => void;
};

/**
 * A 3-second full-screen takeover shown the moment the user commits to today's
 * adaptive session (Update today's plan). Auto-dismisses at 3.0s onto whatever
 * the caller wanted to resume; no Skip control, tap-anywhere fast-forwards to
 * the same 400ms crossfade.
 */
export function AdaptiveSessionActivated({ onComplete }: AdaptiveSessionActivatedProps) {
  const [dismissing, setDismissing] = useState(false);
  const completedRef = useRef(false);

  const finish = () => {
    if (completedRef.current) {
      return;
    }
    completedRef.current = true;
    setDismissing(true);
    window.setTimeout(onComplete, CROSSFADE_MS);
  };

  useEffect(() => {
    const timer = window.setTimeout(finish, HOLD_MS);
    return () => window.clearTimeout(timer);
    // finish and onComplete are stable enough for this once-per-mount timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#07302C] text-[#F5F1E8]"
      onClick={finish}
      role="dialog"
      aria-modal="true"
      aria-label="Adaptive session activated"
      style={{
        opacity: dismissing ? 0 : 1,
        transition: `opacity ${CROSSFADE_MS}ms ease`,
        paddingTop: "var(--safe-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Ambient orbs (behind the vignette). Two of them drift. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="adaptive-decor absolute -right-[70px] -top-[90px] h-[280px] w-[280px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(92,215,185,.5), rgba(92,215,185,0) 66%)",
            filter: "blur(13px)",
            animation: "coach-intro-drift 13s ease-in-out infinite",
          }}
        />
        <div
          className="adaptive-decor absolute -left-[120px] top-[300px] h-[240px] w-[240px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(242,132,58,.3), rgba(242,132,58,0) 66%)",
            filter: "blur(14px)",
            animation: "coach-intro-drift 11s ease-in-out .8s infinite",
          }}
        />
        <div
          className="absolute -bottom-[80px] -right-[60px] h-[250px] w-[250px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(21,133,122,.2), rgba(21,133,122,0) 68%)",
            filter: "blur(11px)",
          }}
        />
        {/* Vignette pulls focus toward the disc. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 70% at 50% 42%, rgba(5,34,31,.15), rgba(5,34,31,.72))",
          }}
        />
      </div>

      {/* Content column, centred */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-6 pt-[54px]">
        {/* Eyebrow pill */}
        <div
          className="adaptive-motion mt-10"
          style={{ animation: `adaptive-rise 500ms ${RISE_EASE} .10s both` }}
        >
          <span
            className="inline-flex items-center rounded-full border border-[rgba(55,201,166,.45)] bg-[rgba(55,201,166,.16)] px-3 py-1.5 font-display text-[10.5px] font-extrabold uppercase tracking-[.14em] text-[#7FE3C9]"
          >
            AI Adaptive Session
          </span>
        </div>

        {/* Disc with rings + sheen */}
        <div className="relative mt-[26px] flex h-[164px] w-[164px] items-center justify-center">
          {/* Rings — one-shot, transform-only entrances + opacity fade */}
          <span
            className="adaptive-decor pointer-events-none absolute h-[196px] w-[196px] rounded-full"
            style={{
              border: "2px solid rgba(92,215,185,.8)",
              animation: `adaptive-ring 2.9s ${RING_EASE} .15s 1 both`,
            }}
          />
          <span
            className="adaptive-decor pointer-events-none absolute h-[196px] w-[196px] rounded-full"
            style={{
              border: "2px solid rgba(92,215,185,.55)",
              animation: `adaptive-ring 2.9s ${RING_EASE} .25s 1 both`,
            }}
          />
          <div
            className="relative flex h-[164px] w-[164px] items-center justify-center overflow-hidden rounded-full"
            style={{
              background:
                "linear-gradient(150deg, #5CD7B9, #0E9E86 60%, #15857A)",
              boxShadow: "0 22px 58px rgba(55,201,166,.42)",
            }}
          >
            <Check className="h-[60px] w-[60px]" strokeWidth={2.6} color="#05221F" />
            {/* Sheen sweep at t=0.80s, once. */}
            <span
              className="adaptive-decor pointer-events-none absolute inset-y-0 -left-1/2 w-[38%]"
              style={{
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.55) 50%, rgba(255,255,255,0) 100%)",
                transform: "translateX(-150%) skewX(-12deg)",
                animation: "adaptive-sheen 550ms ease-in-out .80s 1 both",
              }}
            />
          </div>
        </div>

        {/* Headline */}
        <h1
          className="adaptive-motion mt-[30px] max-w-[300px] text-center font-display text-[34px] font-black leading-[1.02] tracking-[-0.04em] text-[#F5F1E8]"
          style={{
            textWrap: "balance",
            animation: `adaptive-rise 550ms ${RISE_EASE} .32s both`,
          }}
        >
          Today&apos;s session is tuned to you
        </h1>
      </div>

      {/* Progress hairline pinned above the home indicator */}
      <div className="relative z-10 flex flex-col items-center pb-6">
        <div
          className="relative h-[3px] w-[120px] overflow-hidden rounded-full"
          style={{ background: "rgba(245,241,232,.14)" }}
        >
          <span
            className="adaptive-progress absolute inset-y-0 left-0 rounded-full"
            style={{
              background: "linear-gradient(90deg, #F2843A, #FFA867)",
              width: 0,
              animation: "adaptive-fill 2.4s linear .40s both",
            }}
          />
        </div>
        <span
          className="adaptive-motion mt-[10px] text-[11px] font-semibold uppercase tracking-[.14em]"
          style={{
            color: "rgba(245,241,232,.42)",
            animation: `adaptive-rise 500ms ${RISE_EASE} .40s both`,
          }}
        >
          Opening your session
        </span>
      </div>
    </div>
  );
}
