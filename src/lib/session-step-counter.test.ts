import { describe, expect, it } from "vitest";
import { getSessionStepCounter, getSessionStepPhase } from "@/lib/session-step-counter";

// A 45-minute Core session as the player sees it: 3 stretching moves and 4
// warm-up moves (one timeline step each), then 6 exercises.
const coreSession = [
  "stretching-1",
  "stretching-2",
  "stretching-3",
  "warmup-1",
  "warmup-2",
  "warmup-3",
  "warmup-4",
  "plank",
  "dead-bug",
  "side-plank",
  "mountain-climber",
  "hollow-hold",
  "lying-leg-raise",
];

describe("session step counter", () => {
  // The reported bug: Plank comes after Stretching and Warm-up, so it is step
  // 3 of 8, but the player showed "8/8".
  it("counts Plank as step 3 of 8, after Stretching and Warm-up", () => {
    expect(getSessionStepCounter(coreSession, 7, false)).toBe("3/8");
  });

  it("counts every stretching move as step 1 and every warm-up move as step 2", () => {
    for (const index of [0, 1, 2]) {
      expect(getSessionStepCounter(coreSession, index, false)).toBe("1/8");
    }
    for (const index of [3, 4, 5, 6]) {
      expect(getSessionStepCounter(coreSession, index, false)).toBe("2/8");
    }
  });

  it("then counts each exercise", () => {
    expect(getSessionStepCounter(coreSession, 8, false)).toBe("4/8");
    expect(getSessionStepCounter(coreSession, 12, false)).toBe("8/8");
  });

  it("never runs past the real total", () => {
    for (let index = 0; index < coreSession.length; index += 1) {
      const [position, total] = getSessionStepCounter(coreSession, index, false)
        .split("/")
        .map(Number);
      expect(position).toBeLessThanOrEqual(total);
    }
  });

  it("shows the last step once the session is complete", () => {
    expect(getSessionStepCounter(coreSession, 0, true)).toBe("8/8");
  });

  it("takes the total from the session, not a fixed 8", () => {
    const longer = [...coreSession, "flutter-kicks", "bird-dog"];
    expect(getSessionStepCounter(longer, 7, false)).toBe("3/10");
  });

  it("handles shorter sessions with no stretching block", () => {
    const short = ["warmup-1", "warmup-2", "warmup-3", "warmup-4", "push-up", "squat"];
    expect(getSessionStepCounter(short, 0, false)).toBe("1/3");
    expect(getSessionStepCounter(short, 4, false)).toBe("2/3");
    expect(getSessionStepCounter(short, 5, false)).toBe("3/3");
  });

  it("keeps an out-of-range index on a real step", () => {
    expect(getSessionStepCounter(coreSession, 99, false)).toBe("8/8");
    expect(getSessionStepCounter(coreSession, -1, false)).toBe("1/8");
    expect(getSessionStepCounter([], 0, false)).toBe("");
  });

  it("only treats the lead-in ids as stretching and warm-up", () => {
    expect(getSessionStepPhase("stretching-2")).toBe("stretch");
    expect(getSessionStepPhase("warmup-4")).toBe("warmup");
    // Real exercise ids can contain "warm-up"; they're still exercises.
    expect(getSessionStepPhase("dynamic-warm-up-0-0")).toBe("exercise");
    expect(getSessionStepPhase("plank")).toBe("exercise");
  });
});
