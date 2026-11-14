import { describe, expect, it } from "vitest";
import { calculateStreak } from "@/lib/recommendations";
import { toLocalIsoDate } from "@/lib/utils";
import type { WorkoutLog } from "@/lib/types";

const dayAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalIsoDate(d);
};
const workout = (n: number): WorkoutLog =>
  ({
    id: `w${n}`,
    sessionId: `w${n}`,
    sessionDate: dayAgo(n),
    exercisesCompleted: [],
    completedSession: true,
    effort: "steady",
    notes: "",
  }) as unknown as WorkoutLog;

describe("calculateStreak", () => {
  it("is 0 with no activity", () => {
    expect(calculateStreak([], [])).toBe(0);
  });

  it("counts consecutive days including today", () => {
    expect(calculateStreak([workout(0), workout(1), workout(2)], [])).toBe(3);
  });

  it("keeps yesterday's streak alive while today is still in progress", () => {
    // Trained the last 5 days, nothing logged yet today.
    expect(calculateStreak([1, 2, 3, 4, 5].map(workout), [])).toBe(5);
  });

  it("breaks when yesterday was missed", () => {
    expect(calculateStreak([workout(2), workout(3)], [])).toBe(0);
  });

  it("stops at the first gap", () => {
    expect(calculateStreak([workout(0), workout(1), workout(3)], [])).toBe(2);
  });
});
