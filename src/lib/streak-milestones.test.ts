import { describe, expect, it } from "vitest";
import {
  STREAK_LADDER,
  STREAK_MILESTONE_COPY,
  daysIntoRun,
  streakReceipts,
  streakRunStart,
  streakRunStats,
  streakTierFor,
} from "@/lib/streak-milestones";
import type { WorkoutLog } from "@/lib/types";

function workoutOn(sessionDate: string): WorkoutLog {
  return {
    id: `w-${sessionDate}`,
    sessionDate,
    sessionId: "s1",
    exercisesCompleted: ["push-up"],
    completedSession: true,
    effort: "steady",
    notes: "",
  };
}

describe("streakTierFor", () => {
  it("maps the ladder onto the four treatments", () => {
    expect(streakTierFor(3)).toBe("spark");
    expect(streakTierFor(7)).toBe("ember");
    expect(streakTierFor(14)).toBe("gold");
    expect(streakTierFor(30)).toBe("elite");
  });

  it("keeps the elite treatment for the repeats past 30", () => {
    expect(streakTierFor(60)).toBe("elite");
    expect(streakTierFor(100)).toBe("elite");
  });
});

describe("streakRunStart", () => {
  it("counts back from today, inclusive of today", () => {
    expect(streakRunStart(1, "2026-08-12")).toBe("2026-08-12");
    expect(streakRunStart(5, "2026-08-12")).toBe("2026-08-08");
  });

  it("is stable for the whole run, which is what scopes a milestone to it", () => {
    // Same run seen on three different days resolves to the same key, so a
    // milestone claimed on day 3 stays claimed on day 9.
    expect(streakRunStart(3, "2026-08-10")).toBe("2026-08-08");
    expect(streakRunStart(5, "2026-08-12")).toBe("2026-08-08");
    expect(streakRunStart(9, "2026-08-16")).toBe("2026-08-08");
  });

  it("has no run to scope to without a streak", () => {
    expect(streakRunStart(0, "2026-08-12")).toBeNull();
  });

  it("crosses a month boundary", () => {
    expect(streakRunStart(5, "2026-09-02")).toBe("2026-08-29");
  });
});

describe("streakReceipts", () => {
  it("labels every day of the run and heroes the milestone day", () => {
    // 2026-08-10 is a Monday.
    const tiles = streakReceipts({ milestone: 3, runStart: "2026-08-10", short: false });

    expect(tiles.map((tile) => tile.label)).toEqual(["MON", "TUE", "WED"]);
    expect(tiles.map((tile) => tile.isToday)).toEqual([false, false, true]);
  });

  it("uses single letters for the seven-day row", () => {
    const tiles = streakReceipts({ milestone: 7, runStart: "2026-08-10", short: true });

    expect(tiles).toHaveLength(7);
    expect(tiles.map((tile) => tile.label)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    expect(tiles.filter((tile) => tile.isToday)).toHaveLength(1);
  });
});

describe("streakRunStats", () => {
  it("counts only workouts inside the run", () => {
    const stats = streakRunStats({
      streak: 30,
      runStart: "2026-07-14",
      workoutLogs: [
        workoutOn("2026-07-01"), // before the run
        workoutOn("2026-07-20"),
        workoutOn("2026-08-02"),
      ],
      workoutLoadLogs: [],
    });

    expect(stats[0]).toEqual({ value: "30 days", label: "NO RESET" });
    expect(stats[1]).toEqual({ value: "2", label: "WORKOUTS THIS RUN" });
  });

  it("does not double-count a day logged as both a session and a set", () => {
    const stats = streakRunStats({
      streak: 30,
      runStart: "2026-07-14",
      workoutLogs: [workoutOn("2026-07-20")],
      workoutLoadLogs: [
        {
          id: "l1",
          sessionDate: "2026-07-20",
          sessionId: "s1",
          exerciseId: "e1",
          exerciseName: "Squat",
          setNumber: 1,
          reps: 8,
          loadValue: 40,
          loadUnit: "kg",
          loggedAt: "2026-07-20T09:00:00",
        },
      ],
    });

    expect(stats[1].value).toBe("1");
  });

  it("says workout, singular, when there is one", () => {
    const stats = streakRunStats({
      streak: 30,
      runStart: "2026-07-14",
      workoutLogs: [workoutOn("2026-07-20")],
      workoutLoadLogs: [],
    });

    expect(stats[1].label).toBe("WORKOUT THIS RUN");
  });
});

describe("copy", () => {
  it("covers every rung on the ladder", () => {
    for (const days of STREAK_LADDER) {
      expect(STREAK_MILESTONE_COPY[days]).toBeDefined();
    }
  });

  it("makes no claim about other members", () => {
    // The handoff's "80% of members" / "top 4%" lines need cohort data that
    // does not exist; hardcoding them would show everyone the same unmeasured
    // claim about other people.
    for (const days of STREAK_LADDER) {
      const copy = STREAK_MILESTONE_COPY[days];
      const text = `${copy.headline} ${copy.support ?? ""} ${copy.toast}`;

      expect(text).not.toMatch(/members|top \d|%/i);
    }
  });

  it("shows tiles instead of a support line on the early rungs", () => {
    expect(STREAK_MILESTONE_COPY[3].support).toBeNull();
    expect(STREAK_MILESTONE_COPY[7].support).toBeNull();
    expect(STREAK_MILESTONE_COPY[14].support).toBeTruthy();
    expect(STREAK_MILESTONE_COPY[30].support).toBeTruthy();
  });
});

describe("daysIntoRun", () => {
  it("counts the first day as day one", () => {
    expect(daysIntoRun("2026-08-08", "2026-08-08")).toBe(1);
    expect(daysIntoRun("2026-08-08", "2026-08-12")).toBe(5);
  });
});
