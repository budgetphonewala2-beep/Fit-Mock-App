"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Utensils } from "lucide-react";

const EXIT_MS = 280;

// Every ring is centred on the badge, so the burst reads as coming out of it.
const RINGS = [
  { border: "rgba(55,201,166,.6)", delay: "0.1s" },
  { border: "rgba(242,132,58,.5)", delay: "0.6s" },
  { border: "rgba(245,241,232,.28)", delay: "1.1s" },
];

// Positions are for the 393pt design canvas; the stage below is capped at that
// width so the fall stays inside the composition on a wider viewport.
const CONFETTI = [
  { left: 34, width: 9, height: 14, radius: 2, color: "var(--accent)", duration: "3.4s", delay: "0.1s", opacity: 1 },
  { left: 96, width: 8, height: 8, radius: 999, color: "var(--brand)", duration: "4s", delay: "0.9s", opacity: 1 },
  { left: 168, width: 10, height: 5, radius: 2, color: "#FFD24A", duration: "3.1s", delay: "1.6s", opacity: 1 },
  { left: 246, width: 7, height: 13, radius: 2, color: "var(--background)", duration: "3.8s", delay: "0.5s", opacity: 0.8 },
  { left: 306, width: 9, height: 9, radius: 999, color: "var(--accent)", duration: "3.3s", delay: "2.1s", opacity: 1 },
  { left: 356, width: 8, height: 12, radius: 2, color: "var(--brand)", duration: "4.2s", delay: "1.2s", opacity: 1 },
];

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

/** Day 1 gets the milestone wording; later days just state where they are. */
export function formatStreakLabel(streakDay: number) {
  return streakDay <= 1 ? "Day 1 streak started" : `Day ${streakDay} streak`;
}

/**
 * The one-time win shown the moment an account's first meal log saves.
 *
 * Content is a single centred column with the CTA pinned to the bottom safe
 * area, so it holds its composition on any device height. The burst rings live
 * outside that column — behind the text — and are anchored to the measured
 * badge centre rather than a fixed offset, since the column's height moves with
 * the copy.
 */
export function FirstMealLogged({
  mealName,
  kcal,
  mealPhotoUrl,
  streakDay = 1,
  showMeal = true,
  ctaLabel = "Share with friends",
  onShare,
  onDone,
}: {
  mealName: string;
  kcal: number;
  mealPhotoUrl?: string;
  streakDay?: number;
  /** False when the save response had no usable name or calories. */
  showMeal?: boolean;
  ctaLabel?: string;
  /** Awaited before dismissal, so the share sheet closes onto the Diet tab. */
  onShare?: () => void | Promise<void>;
  onDone: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [exiting, setExiting] = useState(false);
  const [ringCenter, setRingCenter] = useState<number | null>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const dismissed = useRef(false);

  // The celebration owns the whole viewport, so the page behind it must not
  // scroll — otherwise its scrollbar shows as a gutter down the overlay's edge.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useLayoutEffect(() => {
    const badge = badgeRef.current;
    if (!badge) return;

    // offsetTop is layout-only, so the badge's own stamp transform doesn't
    // drag the rings around with it.
    const measure = () => setRingCenter(badge.offsetTop + badge.offsetHeight / 2);

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(badge);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [showMeal]);

  // One dismissal path for the CTA, the tap and the Escape key, so the exit
  // cross-fade can never be started twice.
  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(onDone, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting, onDone]);

  function dismiss() {
    if (dismissed.current) return;
    dismissed.current = true;
    setExiting(true);
  }

  // Escape is the keyboard equivalent of the swipe-down this screen expects.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || dismissed.current) return;
      dismissed.current = true;
      setExiting(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleShare() {
    if (dismissed.current) return;
    // Dismiss on completion *or* cancel — either way the moment is over.
    await onShare?.();
    dismiss();
  }

  const streakLabel = formatStreakLabel(streakDay);
  const filledPips = Math.min(Math.max(streakDay, 1), 5);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`First meal logged. ${showMeal ? `${mealName}, ${kcal} kcal. ` : ""}${streakLabel}.`}
      onClick={() => dismiss()}
      className="fixed inset-0 z-[70] overflow-hidden bg-teal-stage text-background"
      style={{
        animation: exiting
          ? `fm-fade-out ${EXIT_MS}ms ease-out both`
          : `fm-fade-in ${reducedMotion ? 150 : 260}ms ease-out both`,
      }}
    >
      {/* Glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-120px] h-[540px] w-[540px] -translate-x-1/2 rounded-full blur-[6px]"
        style={{ background: "radial-gradient(circle,rgba(55,201,166,.5),rgba(55,201,166,0) 62%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-200px] left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle,rgba(242,132,58,.42),rgba(242,132,58,0) 64%)" }}
      />

      {/* Burst rings, centred on the badge */}
      {ringCenter !== null &&
        RINGS.map((ring) => (
          <div
            key={ring.delay}
            aria-hidden
            className="fm-decor pointer-events-none absolute left-1/2 -ml-[115px] -mt-[115px] h-[230px] w-[230px] rounded-full border-2"
            style={{
              top: ringCenter,
              borderColor: ring.border,
              animation: `fm-ring 2.6s cubic-bezier(.2,.7,.3,1) ${ring.delay} infinite`,
            }}
          />
        ))}

      {/* Confetti */}
      <div aria-hidden className="pointer-events-none absolute inset-0 mx-auto max-w-[393px]">
        {CONFETTI.map((piece) => (
          <div
            key={piece.left}
            className="fm-decor absolute top-[-30px]"
            style={{
              left: piece.left,
              width: piece.width,
              height: piece.height,
              borderRadius: piece.radius,
              background: piece.color,
              opacity: piece.opacity,
              animation: `fm-conf ${piece.duration} linear ${piece.delay} infinite`,
            }}
          />
        ))}
      </div>

      {/* Content column. The bottom padding reserves the CTA area, and every
          child is flex:none so a long meal name can never squash the badge. */}
      <div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center px-8 pt-[70px] text-center"
        style={{ paddingBottom: "calc(148px + env(safe-area-inset-bottom))" }}
      >
        <div
          className="fm-motion inline-flex flex-none items-center rounded-full border border-[rgba(55,201,166,0.42)] bg-[rgba(55,201,166,0.14)] px-4 py-2 font-display text-[12px] font-extrabold tracking-[0.14em] text-mint-light"
          style={{ animation: "fm-pop .5s cubic-bezier(.2,.9,.3,1.4) both" }}
        >
          FIRST LOG UNLOCKED
        </div>

        <div
          ref={badgeRef}
          className="fm-motion relative mt-8 h-[156px] w-[156px] flex-none"
          style={{ animation: "fm-stamp .62s cubic-bezier(.2,.9,.3,1.3) .14s both" }}
        >
          <div
            className="fm-motion absolute inset-0 flex items-center justify-center rounded-full shadow-[0_24px_58px_rgba(31,163,131,0.5)]"
            style={{
              background: "linear-gradient(150deg,var(--brand),#1B8F73)",
              animation: "fm-breathe 2.6s ease-in-out infinite",
            }}
          >
            <svg
              width="70"
              height="70"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#07302C"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path
                d="M4.5 12.6l4.7 4.7L19.6 6.6"
                strokeDasharray="34"
                className="fm-motion"
                style={{ animation: "fm-tick .5s cubic-bezier(.5,0,.2,1) .5s both" }}
              />
            </svg>
          </div>
          {/* Specular sweep, clipped to the disc */}
          <div aria-hidden className="fm-decor absolute inset-0 overflow-hidden rounded-full">
            <div
              className="absolute left-0 top-0 h-full w-[38%]"
              style={{
                background:
                  "linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.5),rgba(255,255,255,0))",
                animation: "fm-shine 2.8s ease-in-out 1.1s infinite",
              }}
            />
          </div>
        </div>

        <p
          className="fm-motion mt-[34px] flex-none font-display text-[44px] font-black uppercase leading-[0.94] tracking-[-0.04em]"
          style={{ animation: "fm-rise .55s cubic-bezier(.2,.8,.3,1) .34s both" }}
        >
          First meal logged
        </p>

        {showMeal && (
          <div
            className="fm-motion mt-[30px] inline-flex flex-none items-center gap-2.5 rounded-full border border-[rgba(245,241,232,0.14)] bg-[rgba(245,241,232,0.08)] py-[9px] pl-2.5 pr-4"
            style={{ animation: "fm-rise .5s cubic-bezier(.2,.8,.3,1) .58s both" }}
          >
            {mealPhotoUrl ? (
              <span
                aria-hidden
                className="h-7 w-7 flex-none rounded-full bg-cover bg-center"
                style={{ backgroundImage: `url(${mealPhotoUrl})` }}
              />
            ) : (
              <span
                aria-hidden
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[rgba(55,201,166,0.22)]"
              >
                <Utensils className="h-3.5 w-3.5 text-mint-light" strokeWidth={2.2} />
              </span>
            )}
            <span className="max-w-[190px] truncate text-[14px] font-semibold text-[rgba(245,241,232,0.86)]">
              {mealName}
            </span>
            <span aria-hidden className="h-4 w-px flex-none bg-[rgba(245,241,232,0.18)]" />
            <span className="font-display text-[14px] font-black tabular-nums text-orange-light">
              {kcal} kcal
            </span>
          </div>
        )}

        <div
          className="fm-motion mt-[30px] flex flex-none flex-col items-center gap-[11px]"
          style={{ animation: "fm-pop .55s cubic-bezier(.2,.9,.3,1.3) .92s both" }}
        >
          <div className="flex items-center gap-2.5 font-display text-[19px] font-black tracking-[-0.02em] text-accent">
            <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-accent" />
            <span>{streakLabel}</span>
          </div>
          <div aria-hidden className="flex gap-[7px]">
            {[0, 1, 2, 3, 4].map((pip) => (
              <span
                key={pip}
                className="h-[6px] w-[34px] rounded-full"
                style={{
                  background: pip < filledPips ? "var(--accent)" : "rgba(245,241,232,.16)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* CTA — the only button on screen */}
      <div
        className="fm-motion absolute left-1/2 z-20 w-[calc(100%-48px)] max-w-[345px] -translate-x-1/2"
        style={{
          bottom: "calc(38px + env(safe-area-inset-bottom))",
          animation: "fm-rise .5s ease 1.1s both",
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleShare();
          }}
          className="h-14 w-full rounded-chip bg-brand text-[17px] font-bold text-teal-stage transition active:scale-[0.98]"
        >
          {ctaLabel}
        </button>
      </div>

      {/* Tapping the backdrop dismisses; this keeps that reachable by keyboard
          and screen reader without adding a second visible action. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          dismiss();
        }}
        className="sr-only"
      >
        Close
      </button>
    </div>
  );
}
