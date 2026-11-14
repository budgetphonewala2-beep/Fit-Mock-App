"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { celebrationCopyFor } from "@/lib/achievements";
import { useDietFit } from "@/components/providers/dietfit-provider";

const VISIBLE_MS = 4200;
const EXIT_MS = 240;

/**
 * The inline tier: the generic presenter for any celebration that is not
 * getting a full screen.
 *
 * Every milestone gets one of these for free, which is what makes demotion in
 * `planCelebrationRun` honest -- a takeover that loses the slot still lands,
 * just quietly. It blocks nothing and dismisses itself.
 */
export function CelebrationToast() {
  const { state, currentCelebration, dismissCelebration } = useDietFit();

  const inline = currentCelebration?.tier === "inline" ? currentCelebration : null;
  const copy = inline ? celebrationCopyFor(inline.code, state.achievements) : null;

  // A code with no copy anywhere cannot be rendered generically. Drop it rather
  // than stall the run behind a toast that would be blank.
  useEffect(() => {
    if (inline && !copy) {
      dismissCelebration();
    }
  }, [inline, copy, dismissCelebration]);

  if (!inline || !copy) {
    return null;
  }

  // Keyed on the code so a second toast in the same run mounts fresh instead of
  // inheriting the first one's remaining time.
  return <Toast key={inline.code} copy={copy} onDone={dismissCelebration} />;
}

function Toast({
  copy,
  onDone,
}: {
  copy: { label: string; description: string };
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setLeaving(true), VISIBLE_MS);
    const dismissTimer = window.setTimeout(onDone, VISIBLE_MS + EXIT_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 z-50 mx-auto max-w-md"
      style={{ top: "max(1rem, var(--safe-top))" }}
    >
      <div
        className="glass-panel flex items-center gap-3 rounded-card px-4 py-3 shadow-[0_18px_38px_rgba(12,39,35,0.18)] transition-all duration-200"
        style={{
          opacity: leaving ? 0 : 1,
          transform: leaving ? "translateY(-8px)" : "translateY(0)",
        }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft">
          <Trophy className="h-4.5 w-4.5 text-accent" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{copy.label}</div>
          <p className="truncate text-xs text-muted">{copy.description}</p>
        </div>
      </div>
    </div>
  );
}
