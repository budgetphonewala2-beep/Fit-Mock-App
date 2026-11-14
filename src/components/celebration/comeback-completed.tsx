"use client";

import { useState } from "react";
import { nativeBridge } from "@/lib/native-bridge";
import { renderComebackShareCard } from "@/lib/share-cards";
import { comebackShareText } from "@/lib/share-text";
import { useDietFit } from "@/components/providers/dietfit-provider";

const EXIT_MS = 280;
const COMEBACK_CODE = "comeback";

/**
 * The comeback takeover: the first app open after a long absence.
 *
 * From the comeback handoff, and the deliberate inverse of the streak
 * milestones -- mint rather than orange, the return the hero rather than a
 * number, and no count of the gap anywhere. Rings breathe instead of bursting,
 * the medallion settles down into place, and the return arc draws itself.
 *
 * The screen shows no numbers at all, so it needs no data beyond knowing a
 * comeback is owed -- the queue already decided that.
 */
export function ComebackCompleted() {
  const { state, currentCelebration, dismissCelebration } = useDietFit();
  const [exiting, setExiting] = useState(false);

  // Comeback is day-scoped (`comeback@<date>`); match on the base code.
  const active =
    currentCelebration?.tier === "takeover" &&
    currentCelebration.code.startsWith(`${COMEBACK_CODE}@`);

  if (!active) {
    return null;
  }

  function dismiss() {
    setExiting(true);
    window.setTimeout(() => {
      setExiting(false);
      dismissCelebration();
    }, EXIT_MS);
  }

  // Comeback deliberately shows no number, so the card and text carry none
  // either: no "N days back" boast, matching the screen's quiet re-entry tone.
  async function share() {
    const text = comebackShareText();
    const subject = "Back on Fitmonk";
    try {
      const image = await renderComebackShareCard({
        userName: state.profile?.name?.split(" ")[0],
      });
      await nativeBridge.device.shareImage({
        text,
        subject,
        image,
        filename: "fitmonk-comeback",
      });
    } catch {
      await nativeBridge.device.share({ text, subject }).catch(() => null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Good to see you. Welcome back. Your plan and your history are exactly where you left them. Nothing was reset."
      className="fixed inset-0 z-[70] overflow-hidden"
      style={{
        background: "var(--teal-stage)",
        color: "var(--cream)",
        animation: exiting
          ? `fm-fade-out ${EXIT_MS}ms ease-out both`
          : "fm-fade-in 260ms ease-out both",
      }}
    >
      {/* Glows. The lower orange is deliberately faint -- warmth, not heat. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-150px] h-[560px] w-[560px] -translate-x-1/2 rounded-full blur-[6px]"
        style={{ background: "radial-gradient(circle,rgba(55,201,166,.42),transparent 62%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-200px] left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle,rgba(242,132,58,.2),transparent 64%)" }}
      />

      {/* Breathing rings -- the motion signature that separates this from the
          milestone burst. Slow expand, never the burst curve. */}
      {[0, 2.75].map((delay) => (
        <div
          key={delay}
          aria-hidden
          className="cb-decor pointer-events-none absolute left-1/2 top-[42%] h-[230px] w-[230px] -ml-[115px] -mt-[115px] rounded-full"
          style={{
            border: "1.5px solid",
            borderColor: delay === 0 ? "rgba(55,201,166,.4)" : "rgba(245,241,232,.16)",
            animation: `cb-breathe 5.5s ease-in-out ${delay}s infinite`,
          }}
        />
      ))}

      {/* Close */}
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

      {/* Content */}
      <div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center px-[30px] text-center"
        style={{ paddingBottom: "calc(150px + env(safe-area-inset-bottom))" }}
      >
        <div
          className="cb-motion inline-flex flex-none items-center rounded-full border px-4 py-2 font-display text-[12px] font-extrabold tracking-[0.14em]"
          style={{
            background: "rgba(55,201,166,.16)",
            borderColor: "rgba(55,201,166,.5)",
            color: "var(--mint-light)",
            animation: "fm-fade-in .6s ease both",
          }}
        >
          GOOD TO SEE YOU
        </div>

        {/* Hero medallion — settles down into place, a landing not a launch. */}
        <div
          className="cb-motion relative mt-[34px] h-[172px] w-[172px] flex-none"
          style={{ animation: "cb-settle .8s cubic-bezier(.2,.8,.3,1) .1s both" }}
        >
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full"
            style={{
              background: "linear-gradient(150deg,#5CD7B9,#0E9E86)",
              boxShadow: "0 22px 58px rgba(55,201,166,.4)",
            }}
          >
            <svg width="86" height="86" viewBox="0 0 24 24" fill="none" stroke="var(--teal-deep)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path
                d="M20.5 12a8.5 8.5 0 11-4.6-7.56"
                strokeDasharray="64"
                className="cb-motion"
                style={{ animation: "cb-trace 1.1s cubic-bezier(.3,.8,.3,1) .45s both" }}
              />
              <path
                d="M15.4 1.1l1.1 4.2-4.2 1"
                className="cb-motion"
                style={{ animation: "fm-fade-in .4s ease 1.35s both" }}
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
          Welcome back
        </h2>

        <p
          className="cb-motion mt-4 max-w-[302px] flex-none text-[16px] leading-[1.45]"
          style={{ color: "rgba(245,241,232,.64)", animation: "fm-rise .55s ease .45s both" }}
        >
          Your plan and your history are exactly where you left them. Nothing was reset.
        </p>
      </div>

      {/* CTAs — primary button plus a low-key text share below it. Share is
          secondary here on purpose: a comeback isn't a milestone, so we don't
          give it the same weight as "Share my streak". */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-6"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={dismiss}
          className="cb-motion block w-full max-w-[322px] rounded-full font-display text-[17px] font-extrabold transition active:scale-[0.98]"
          style={{
            height: 56,
            background: "var(--brand)",
            color: "var(--teal-deep)",
            boxShadow: "0 14px 30px rgba(55,201,166,.4)",
            animation: "fm-rise .55s cubic-bezier(.2,.8,.3,1) .75s both",
          }}
        >
          Let&apos;s Get Back to It
        </button>
        <button
          type="button"
          onClick={share}
          className="cb-motion font-display text-[13px] font-semibold tracking-[0.12em] uppercase transition active:opacity-70"
          style={{
            color: "rgba(245,241,232,.6)",
            animation: "fm-fade-in .5s ease .95s both",
          }}
        >
          Share
        </button>
      </div>
    </div>
  );
}
