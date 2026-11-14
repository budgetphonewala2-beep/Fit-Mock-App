// The guided home session counts the same steps as the timeline: Stretching is
// one step, Warm-up is one step, then each exercise. The player plays the
// lead-ins as several moves (3 stretches, 4 warm-up moves), but those are parts
// of one step, so in a Core session with 6 exercises the first exercise is
// "3/8", not the 8th move. The total comes from the session itself; it used
// to be hard-coded to 8.

export type SessionStepPhase = "stretch" | "warmup" | "exercise";

// Player step ids: `stretching-N` and `warmup-N` for the lead-in moves, the
// exercise id for everything else.
export function getSessionStepPhase(stepId: string): SessionStepPhase {
  if (/^stretching-\d+$/.test(stepId)) return "stretch";
  if (/^warmup-\d+$/.test(stepId)) return "warmup";
  return "exercise";
}

export function getSessionStepCounter(
  stepIds: string[],
  activeIndex: number,
  sessionComplete: boolean,
): string {
  const phases = stepIds.map(getSessionStepPhase);
  const hasStretch = phases.includes("stretch");
  const hasWarmup = phases.includes("warmup");
  const exerciseCount = phases.filter((phase) => phase === "exercise").length;
  const total = Number(hasStretch) + Number(hasWarmup) + exerciseCount;

  if (total === 0) {
    return "";
  }
  if (sessionComplete) {
    return `${total}/${total}`;
  }

  const index = Math.min(Math.max(activeIndex, 0), phases.length - 1);
  const phase = phases[index];
  const position =
    phase === "stretch"
      ? 1
      : phase === "warmup"
        ? Number(hasStretch) + 1
        : Number(hasStretch) +
          Number(hasWarmup) +
          phases.slice(0, index + 1).filter((p) => p === "exercise").length;
  return `${position}/${total}`;
}
