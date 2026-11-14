"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Cookie, Moon, Sunrise, Trophy, Utensils } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { nativeBridge } from "@/lib/native-bridge";
import { dayFullyLoggedShareText } from "@/lib/share-text";
import {
  CELEBRATION_DAY_FULLY_LOGGED,
  parseScopedCelebrationCode,
} from "@/lib/achievements";
import { generateDietTimelinePlan } from "@/lib/recommendations";
import type { DietTimelineMeal, MealType } from "@/lib/types";

const EXIT_MS = 400;
const RISE_EASE = "cubic-bezier(.22,1,.36,1)";
const IGNITE_EASE = "cubic-bezier(.2,.9,.3,1.4)";
const STAMP_EASE = "cubic-bezier(.2,.9,.3,1.5)";
const RING_EASE = "cubic-bezier(.16,.84,.3,1)";

const MEAL_GLYPH: Record<MealType, ComponentType<SVGProps<SVGSVGElement>>> = {
  breakfast: Sunrise,
  lunch: Utensils,
  snack: Cookie,
  dinner: Moon,
};

/**
 * Full-bleed takeover shown once per day when the last planned meal in the
 * user's diet plan is logged. Waits for a tap — a day-end win is closed by
 * the user, not by a timer.
 */
export function DayFullyLogged() {
  const { state, currentCelebration, dismissCelebration } = useDietFit();
  const [exiting, setExiting] = useState(false);

  const parsed = currentCelebration
    ? parseScopedCelebrationCode(currentCelebration.code)
    : null;
  const isDayFullyLoggedTakeover =
    currentCelebration?.tier === "takeover" &&
    parsed?.code === CELEBRATION_DAY_FULLY_LOGGED;

  const plannedMeals = useMemo<DietTimelineMeal[]>(() => {
    if (!isDayFullyLoggedTakeover) {
      return [];
    }

    if (!state.profile || !state.nutritionTargets) {
      return [];
    }

    return generateDietTimelinePlan(state.profile, state.nutritionTargets);
  }, [isDayFullyLoggedTakeover, state.profile, state.nutritionTargets]);

  // The queue counts on this screen to present the code and dismiss it. With
  // no plan to show, close it straight away rather than leave an invisible
  // takeover at the head of the queue, blocking every celebration behind it.
  const nothingToShow = isDayFullyLoggedTakeover && plannedMeals.length === 0;
  useEffect(() => {
    if (nothingToShow) {
      dismissCelebration();
    }
  }, [nothingToShow, dismissCelebration]);

  if (!isDayFullyLoggedTakeover || plannedMeals.length === 0) {
    return null;
  }

  function dismiss() {
    setExiting(true);
    window.setTimeout(() => {
      setExiting(false);
      dismissCelebration();
    }, EXIT_MS);
  }

  async function share() {
    const text = dayFullyLoggedShareText();
    // Through the native bridge, like every other share: Android WebView has
    // no navigator.share, so the old direct call did nothing in the app.
    await nativeBridge.device
      .share({ text, subject: "Day fully logged | Fitmonk" })
      .catch(() => null);
    dismiss();
  }

  const gridColsClass = plannedMeals.length <= 2 ? "grid-cols-2" : "grid-cols-2";

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#07302C] text-[#F5F1E8]"
      role="dialog"
      aria-modal="true"
      aria-label="Day fully logged"
      style={{
        opacity: exiting ? 0 : 1,
        transition: `opacity ${EXIT_MS}ms ease`,
        paddingTop: "var(--safe-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Ambient orbs behind vignette */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="adaptive-decor absolute -right-[80px] -top-[100px] h-[300px] w-[300px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(92,215,185,.5), rgba(92,215,185,0) 66%)",
            filter: "blur(13px)",
            animation: "coach-intro-drift 13s ease-in-out infinite",
          }}
        />
        <div
          className="adaptive-decor absolute -left-[130px] top-[330px] h-[250px] w-[250px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(242,132,58,.3), rgba(242,132,58,0) 66%)",
            filter: "blur(14px)",
            animation: "coach-intro-drift 11s ease-in-out .8s infinite",
          }}
        />
        <div
          className="absolute -bottom-[90px] -right-[70px] h-[260px] w-[260px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(21,133,122,.2), rgba(21,133,122,0) 68%)",
            filter: "blur(11px)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 72% at 50% 40%, rgba(5,34,31,.12), rgba(5,34,31,.74))",
          }}
        />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-6 pt-[54px] pb-[16px]">
        {/* Eyebrow */}
        <div
          className="adaptive-motion"
          style={{ animation: `adaptive-rise 500ms ${RISE_EASE} .10s both` }}
        >
          <span className="inline-flex items-center rounded-full border border-[rgba(55,201,166,.45)] bg-[rgba(55,201,166,.16)] px-3 py-1.5 font-display text-[10.5px] font-extrabold uppercase tracking-[.14em] text-[#7FE3C9]">
            Day fully logged
          </span>
        </div>

        {/* Hero disc + rings */}
        <div className="relative mt-[22px] flex h-[148px] w-[148px] items-center justify-center">
          <span
            className="adaptive-decor pointer-events-none absolute h-[148px] w-[148px] rounded-full"
            style={{
              border: "2px solid rgba(92,215,185,.7)",
              animation: `day-fully-ring 2.2s ${RING_EASE} .18s 1 both`,
            }}
          />
          <span
            className="adaptive-decor pointer-events-none absolute h-[148px] w-[148px] rounded-full"
            style={{
              border: "2px solid rgba(92,215,185,.45)",
              animation: `day-fully-ring 2.2s ${RING_EASE} .32s 1 both`,
            }}
          />
          <div
            className="day-fully-stamp relative flex h-[128px] w-[128px] items-center justify-center overflow-hidden rounded-full"
            style={{
              background:
                "linear-gradient(150deg, #5CD7B9, #0E9E86 60%, #15857A)",
              boxShadow: "0 20px 50px rgba(55,201,166,.42)",
              animation: `day-fully-hero 620ms ${IGNITE_EASE} .14s 1 both`,
            }}
          >
            <Trophy className="h-[66px] w-[66px]" strokeWidth={1.9} color="#05221F" />
          </div>
        </div>

        {/* Meal grid */}
        <div
          className={`mt-[26px] grid w-full max-w-[296px] gap-3 ${gridColsClass}`}
        >
          {plannedMeals.map((meal, index) => {
            const Glyph = MEAL_GLYPH[meal.mealType] ?? Utensils;
            const igniteDelay = 0.2 + index * 0.12;
            const stampDelay = 0.46 + index * 0.12;

            return (
              <div
                key={meal.id}
                className="day-fully-stamp relative overflow-hidden rounded-[22px] border px-3.5 pb-3.5 pt-4"
                style={{
                  background: "rgba(245,241,232,.07)",
                  borderColor: "rgba(245,241,232,.14)",
                  animation: `day-fully-ignite 620ms ${IGNITE_EASE} ${igniteDelay}s 1 both`,
                }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                  style={{ background: "rgba(55,201,166,.18)" }}
                >
                  <Glyph className="h-5 w-5" strokeWidth={2} color="#5CD7B9" />
                </div>
                <div className="mt-[10px] font-display text-[14.5px] font-extrabold leading-tight text-[#F5F1E8]">
                  {meal.title}
                </div>
                <span
                  className="day-fully-stamp absolute right-2 top-2 flex h-[22px] w-[22px] items-center justify-center rounded-full"
                  style={{
                    background: "#37C9A6",
                    animation: `day-fully-stamp-in 460ms ${STAMP_EASE} ${stampDelay}s 1 both`,
                  }}
                >
                  <Check className="h-[13px] w-[13px]" strokeWidth={3.4} color="#05221F" />
                </span>
              </div>
            );
          })}
        </div>

        {/* Headline */}
        <h1
          className="adaptive-motion mt-[26px] max-w-[300px] text-center font-display text-[34px] font-black leading-[1.02] tracking-[-0.04em] text-[#F5F1E8]"
          style={{
            textWrap: "balance",
            animation: `adaptive-rise 550ms ${RISE_EASE} .78s both`,
          }}
        >
          You ate your plan today
        </h1>

        {/* Spacer, then CTA block pinned near the bottom */}
        <div className="min-h-[16px] flex-1" />

        <button
          type="button"
          onClick={share}
          className="adaptive-motion flex h-[54px] w-full items-center justify-center rounded-full font-display text-[16px] font-extrabold text-[#2A1206] transition active:scale-[0.98]"
          style={{
            background: "#F2843A",
            boxShadow: "0 14px 34px rgba(242,132,58,.34)",
            animation: `adaptive-rise 550ms ${RISE_EASE} 1.05s both`,
          }}
        >
          Share with friends
        </button>

        <button
          type="button"
          onClick={dismiss}
          className="adaptive-motion mt-1 flex min-h-[44px] w-full items-center justify-center text-[14px] font-semibold text-[rgba(245,241,232,.7)] transition active:scale-[0.98]"
          style={{ animation: `adaptive-rise 550ms ${RISE_EASE} 1.15s both` }}
        >
          Back to today
        </button>
      </div>
    </div>
  );
}
