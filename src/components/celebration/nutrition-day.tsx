"use client";

import { useMemo, useState } from "react";
import { nativeBridge } from "@/lib/native-bridge";
import { renderNutritionDayShareCard } from "@/lib/share-cards";
import { nutritionDayShareText } from "@/lib/share-text";
import { useDietFit } from "@/components/providers/dietfit-provider";

const EXIT_MS = 280;
const CODE = "nutrition-day";

/**
 * Fires the moment today's protein and hydration targets are both hit -- the
 * daily fuelling win. Day-scoped and immediate: the achievement layer only
 * schedules it once per day and pauses re-fires, so this component owns the
 * screen and the share hand-off, nothing more.
 *
 * Kept in the same mint-teal family as the comeback screen on purpose -- both
 * are calm, no-numbers-in-the-hero moments; the burst treatment belongs to the
 * streak ladder.
 */
export function NutritionDayCompleted() {
  const { state, currentCelebration, dismissCelebration } = useDietFit();
  const [exiting, setExiting] = useState(false);

  const active =
    currentCelebration?.tier === "takeover" &&
    currentCelebration.code.startsWith(`${CODE}@`);

  const proteinG = useMemo(() => {
    if (!active) return 0;
    // Sum today's protein straight off the ledger so a refresh mid-celebration
    // still sees the same number the achievement layer used to fire it.
    const today = new Date().toISOString().slice(0, 10);
    return state.mealLogs
      .filter((log) => log.loggedAt.startsWith(today))
      .reduce((sum, log) => sum + log.estimatedNutrition.proteinG, 0);
  }, [active, state.mealLogs]);

  if (!active) return null;

  function dismiss() {
    setExiting(true);
    window.setTimeout(() => {
      setExiting(false);
      dismissCelebration();
    }, EXIT_MS);
  }

  async function share() {
    const text = nutritionDayShareText();
    const subject = "Nutrition dialed | Fitmonk";
    try {
      const image = await renderNutritionDayShareCard({
        proteinG,
        userName: state.profile?.name?.split(" ")[0],
      });
      await nativeBridge.device.shareImage({
        text,
        subject,
        image,
        filename: "fitmonk-nutrition-day",
      });
    } catch {
      await nativeBridge.device.share({ text, subject }).catch(() => null);
    }
    dismiss();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nutrition dialed. Protein and hydration both hit today."
      className="fixed inset-0 z-[70] overflow-hidden"
      style={{
        background: "var(--teal-stage)",
        color: "var(--cream)",
        animation: exiting
          ? `fm-fade-out ${EXIT_MS}ms ease-out both`
          : "fm-fade-in 260ms ease-out both",
      }}
    >
      {/* Warm mint from above, faint teal-brand from below -- calm, not the
          milestone burst. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-150px] h-[560px] w-[560px] -translate-x-1/2 rounded-full blur-[6px]"
        style={{ background: "radial-gradient(circle,rgba(127,227,201,.42),transparent 62%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-200px] left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle,rgba(55,201,166,.24),transparent 64%)" }}
      />

      {/* Breathing rings -- share the comeback screen's slow signature so the
          two day-scoped wins read as siblings. */}
      {[0, 2.75].map((delay) => (
        <div
          key={delay}
          aria-hidden
          className="cb-decor pointer-events-none absolute left-1/2 top-[42%] h-[230px] w-[230px] -ml-[115px] -mt-[115px] rounded-full"
          style={{
            border: "1.5px solid",
            borderColor: delay === 0 ? "rgba(127,227,201,.42)" : "rgba(245,241,232,.16)",
            animation: `cb-breathe 5.5s ease-in-out ${delay}s infinite`,
          }}
        />
      ))}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="cb-motion absolute z-20 flex h-11 w-11 items-center justify-center rounded-full"
        style={{
          top: "max(54px, calc(var(--safe-top) + 18px))",
          right: 18,
          background: "rgba(245,241,232,.1)",
          animation: "fm-fade-in .5s ease 1.4s both",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" stroke="rgba(245,241,232,.7)" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </button>

      <div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center px-[30px] text-center"
        style={{ paddingBottom: "calc(150px + env(safe-area-inset-bottom))" }}
      >
        <div
          className="cb-motion inline-flex flex-none items-center rounded-full border px-4 py-2 font-display text-[12px] font-extrabold tracking-[0.14em]"
          style={{
            background: "rgba(127,227,201,.16)",
            borderColor: "rgba(127,227,201,.5)",
            color: "var(--mint-light)",
            animation: "fm-fade-in .6s ease both",
          }}
        >
          NUTRITION DIALED
        </div>

        <div
          className="cb-motion relative mt-[34px] h-[172px] w-[172px] flex-none"
          style={{ animation: "cb-settle .8s cubic-bezier(.2,.8,.3,1) .1s both" }}
        >
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full"
            style={{
              background: "linear-gradient(150deg,#7FE3C9,#0E9E86)",
              boxShadow: "0 22px 58px rgba(55,201,166,.4)",
            }}
          >
            <svg
              width="86"
              height="86"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--teal-deep)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path
                d="M20 6 9 17l-5-5"
                strokeDasharray="30"
                className="cb-motion"
                style={{ animation: "cb-trace 1.1s cubic-bezier(.3,.8,.3,1) .45s both" }}
              />
            </svg>
            <div
              aria-hidden
              className="cb-decor absolute left-0 top-0 h-full w-[40%]"
              style={{
                background: "linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.35),rgba(255,255,255,0))",
                animation: "cb-sweep 5s ease-in-out 1.6s infinite",
              }}
            />
          </div>
        </div>

        <h2
          className="cb-motion mt-[34px] flex-none font-display font-black uppercase"
          style={{
            fontSize: 42,
            lineHeight: 0.98,
            letterSpacing: "-0.035em",
            animation: "fm-rise .6s cubic-bezier(.2,.8,.3,1) .3s both",
          }}
        >
          Nutrition dialed
        </h2>

        <p
          className="cb-motion mt-4 max-w-[302px] flex-none text-[16px] leading-[1.45]"
          style={{ color: "rgba(245,241,232,.64)", animation: "fm-rise .55s ease .45s both" }}
        >
          Protein and hydration both hit today. Great day of fuelling.
        </p>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-6"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={share}
          className="cb-motion block w-full max-w-[322px] rounded-full font-display text-[17px] font-extrabold transition active:scale-[0.98]"
          style={{
            height: 56,
            background: "var(--brand)",
            color: "var(--teal-deep)",
            boxShadow: "0 14px 30px rgba(55,201,166,.4)",
            animation: "fm-rise .55s cubic-bezier(.2,.8,.3,1) .75s both",
          }}
        >
          Share this win
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="cb-motion font-display text-[13px] font-semibold tracking-[0.12em] uppercase transition active:opacity-70"
          style={{
            color: "rgba(245,241,232,.6)",
            animation: "fm-fade-in .5s ease .95s both",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
