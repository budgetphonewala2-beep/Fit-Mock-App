"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────
 *  WaterTracker – iOS-native animated water jar
 * ──────────────────────────────────────────────────────────── */

interface WaterTrackerProps {
  currentMl: number;
  targetMl: number;
  onAdd: (ml: number) => void;
  onRemove: (ml: number) => void;
  stepMl?: number;
  showQuickAddChips?: boolean;
  compact?: boolean;
}

export function WaterTracker({
  currentMl,
  targetMl,
  onAdd,
  onRemove,
  stepMl = 250,
  showQuickAddChips = true,
  compact = false,
}: WaterTrackerProps) {
  const progress = targetMl > 0 ? Math.min((currentMl / targetMl) * 100, 100) : 0;
  const [ripple, setRipple] = useState(false);
  const [bounce, setBounce] = useState<"add" | "remove" | null>(null);
  const bounceTimeoutRef = useRef<number | null>(null);
  const rippleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (bounceTimeoutRef.current !== null) {
        window.clearTimeout(bounceTimeoutRef.current);
      }

      if (rippleTimeoutRef.current !== null) {
        window.clearTimeout(rippleTimeoutRef.current);
      }
    };
  }, []);

  /* Water level – 8% minimum so the jar never looks fully empty */
  const waterLevel = Math.max(8, progress);

  function playFeedback(direction: "add" | "remove") {
    if (bounceTimeoutRef.current !== null) {
      window.clearTimeout(bounceTimeoutRef.current);
    }

    if (rippleTimeoutRef.current !== null) {
      window.clearTimeout(rippleTimeoutRef.current);
    }

    setBounce(direction);
    setRipple(true);

    bounceTimeoutRef.current = window.setTimeout(() => setBounce(null), 500);
    rippleTimeoutRef.current = window.setTimeout(() => setRipple(false), 600);
  }

  function handleAdd(ml: number) {
    playFeedback("add");
    onAdd(ml);
  }

  function handleRemove(ml: number) {
    playFeedback("remove");
    onRemove(ml);
  }

  return (
    <div className={cn("water-tracker", compact && "water-tracker--compact")}>
      <div className="water-tracker__content">
        <div className="water-tracker__stats">
          <div className="water-tracker__amount">
            <span className="water-tracker__amount-value">{currentMl}</span>
            <span className="water-tracker__amount-unit">ml</span>
            <span className="water-tracker__target">/ {targetMl} ml</span>
          </div>
          <p className="water-tracker__percent">{Math.round(progress)}% completed</p>
        </div>

        <div className="water-tracker__controls">
          <button
            type="button"
            aria-label={`Remove ${stepMl} milliliters of water`}
            className={cn(
              "water-tracker__btn water-tracker__btn--remove",
              bounce === "remove" && "water-tracker__btn--bounce",
            )}
            onClick={() => handleRemove(stepMl)}
          >
            <Minus className="h-5 w-5" />
          </button>

          <div
            className={cn(
              "water-tracker__droplet",
              ripple && "water-tracker__droplet--ripple",
            )}
          >
            <svg
              className="water-tracker__droplet-outline"
              viewBox="0 0 120 140"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* A jar: straight sides and a rounded base, so the water level
                  reads like a filling glass. */}
              <defs>
                <linearGradient id="waterGrad" x1="60" y1="12" x2="60" y2="132" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="rgba(143,220,255,0.75)" />
                  <stop offset="55%" stopColor="rgba(72,178,255,0.9)" />
                  <stop offset="100%" stopColor="rgba(31,128,234,0.98)" />
                </linearGradient>
                <clipPath id="water-drop-clip">
                  <path d="M33 10 H87 Q95 10 95 18 V112 Q95 132 75 132 H45 Q25 132 25 112 V18 Q25 10 33 10 Z" />
                </clipPath>
              </defs>

              <path
                d="M33 10 H87 Q95 10 95 18 V112 Q95 132 75 132 H45 Q25 132 25 112 V18 Q25 10 33 10 Z"
                fill="rgba(204, 235, 255, 0.48)"
              />

              <g clipPath="url(#water-drop-clip)">
                <rect
                  className="water-tracker__water-body"
                  x="0"
                  y="0"
                  width="120"
                  height="140"
                  style={{
                    transform: `translateY(${100 - waterLevel}%)`,
                  }}
                />

                <g
                  className="water-tracker__wave water-tracker__wave--1"
                  style={{
                    transform: `translateY(${(100 - waterLevel) * 1.35 - 4}px)`,
                  }}
                >
                  <path
                    d="M-40 12 C-10 2, 12 20, 42 12 C72 2, 94 20, 124 12 C154 2, 176 20, 206 12 L206 180 L-40 180 Z"
                    fill="rgba(84, 178, 255, 0.48)"
                  />
                </g>

                <g
                  className="water-tracker__wave water-tracker__wave--2"
                  style={{
                    transform: `translateY(${(100 - waterLevel) * 1.35}px)`,
                  }}
                >
                  <path
                    d="M-40 14 C-5 4, 22 24, 57 14 C92 4, 119 24, 154 14 C189 4, 216 24, 251 14 L251 180 L-40 180 Z"
                    fill="rgba(32, 139, 239, 0.7)"
                  />
                </g>

                <g
                  className="water-tracker__wave water-tracker__wave--3"
                  style={{
                    transform: `translateY(${(100 - waterLevel) * 1.35 - 6}px)`,
                  }}
                >
                  <path
                    d="M-40 10 C-12 0, 10 18, 38 10 C66 0, 88 18, 116 10 C144 0, 166 18, 194 10 L194 180 L-40 180 Z"
                    fill="rgba(136, 209, 255, 0.28)"
                  />
                </g>
              </g>

              <path
                d="M36 26 V58"
                stroke="rgba(255,255,255,0.88)"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
            </svg>

            {ripple && bounce === "add" ? (
              <div className="water-tracker__bubbles">
                <span className="water-tracker__bubble water-tracker__bubble--1" />
                <span className="water-tracker__bubble water-tracker__bubble--2" />
                <span className="water-tracker__bubble water-tracker__bubble--3" />
                <span className="water-tracker__bubble water-tracker__bubble--4" />
                <span className="water-tracker__bubble water-tracker__bubble--5" />
              </div>
            ) : null}

            <div className="water-tracker__sheen" />
          </div>

          <button
            type="button"
            aria-label={`Add ${stepMl} milliliters of water`}
            className={cn(
              "water-tracker__btn water-tracker__btn--add",
              bounce === "add" && "water-tracker__btn--bounce",
            )}
            onClick={() => handleAdd(stepMl)}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {showQuickAddChips ? (
        <div className="water-tracker__chips">
          {[150, 250, 500].map((ml) => (
            <button
              key={ml}
              type="button"
              className="water-tracker__chip"
              onClick={() => handleAdd(ml)}
            >
              +{ml}ml
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
