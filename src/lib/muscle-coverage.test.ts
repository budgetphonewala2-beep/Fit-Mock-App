import { describe, expect, it } from "vitest";
import {
  getMuscleCoverage,
  getMuscleCoverageScore,
  getMuscleGroupsForExercise,
  MUSCLE_GROUP_COUNT,
} from "@/lib/muscle-coverage";
import type { WorkoutLog } from "@/lib/types";

function log(sessionDate: string, exercisesCompleted: string[]): WorkoutLog {
  return {
    id: `log-${sessionDate}`,
    sessionDate,
    sessionId: "session",
    exercisesCompleted,
    completedSession: true,
    effort: "steady",
    notes: "",
  };
}

describe("muscle coverage", () => {
  it("reads the group out of a slugified exercise id", () => {
    expect(getMuscleGroupsForExercise("dumbbell-bicep-curl-home-preset")).toContain("biceps");
    expect(getMuscleGroupsForExercise("calf-raise-home-preset")).toContain("calves");
    expect(getMuscleGroupsForExercise("plank-home-preset")).toContain("core");
  });

  it("keeps the specific rules ahead of the ones that would swallow them", () => {
    // "leg curl" is a hamstring movement, not a bicep curl.
    expect(getMuscleGroupsForExercise("leg-curl-preset")).toContain("hamstrings");
    expect(getMuscleGroupsForExercise("leg-curl-preset")).not.toContain("biceps");
    // A tricep kickback is not a glute movement.
    expect(getMuscleGroupsForExercise("tricep-kickback-home-preset")).toContain("triceps");
    expect(getMuscleGroupsForExercise("tricep-kickback-home-preset")).not.toContain("glutes");
  });

  it("credits every group a compound movement trains", () => {
    const groups = getMuscleGroupsForExercise("romanian-deadlift-preset", "Romanian Deadlift");

    expect(groups).toContain("hamstrings");
  });

  it("counts anything trained inside a week as covered", () => {
    const entries = getMuscleCoverage({
      workoutLogs: [
        log("2026-06-10", ["dumbbell-bicep-curl-home-preset"]),
        log("2026-06-04", ["calf-raise-home-preset"]),
      ],
      today: "2026-06-11",
    });

    expect(entries).toHaveLength(MUSCLE_GROUP_COUNT);

    const biceps = entries.find((entry) => entry.id === "biceps");
    const calves = entries.find((entry) => entry.id === "calves");

    expect(biceps?.daysSince).toBe(1);
    expect(biceps?.state).toBe("fresh");
    expect(calves?.daysSince).toBe(7);
    expect(calves?.state).toBe("neglected");
    // Only the two trained groups are known; everything else has never been
    // logged, so a fresh account scores 1 of 12 here.
    expect(getMuscleCoverageScore(entries)).toBe(1);
  });

  it("keeps the most recent session when a group appears twice", () => {
    const entries = getMuscleCoverage({
      workoutLogs: [
        log("2026-06-01", ["plank-home-preset"]),
        log("2026-06-09", ["dead-bug-home-preset"]),
      ],
      today: "2026-06-11",
    });

    expect(entries.find((entry) => entry.id === "core")?.daysSince).toBe(2);
  });

  it("sorts the most neglected group first", () => {
    const entries = getMuscleCoverage({
      workoutLogs: [log("2026-06-10", ["dumbbell-bicep-curl-home-preset"])],
      today: "2026-06-11",
    });

    expect(entries[0]?.daysSince).toBeNull();
    expect(entries.at(-1)?.id).toBe("biceps");
  });
});
