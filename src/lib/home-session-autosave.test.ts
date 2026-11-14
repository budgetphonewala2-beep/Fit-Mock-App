import { describe, expect, it } from "vitest";
import {
  getHomeSessionCompleteNote,
  isSessionRecorded,
  shouldAutoSaveHomeSession,
  type HomeSessionAutoSaveInput,
} from "@/lib/home-session-autosave";
import type { WorkoutLog } from "@/lib/types";

const finishedByClock: HomeSessionAutoSaveInput = {
  environment: "home",
  timerLoaded: true,
  isTrainingSession: true,
  sessionId: "monday-core",
  elapsedSeconds: 45 * 60,
  totalSeconds: 45 * 60,
  allExercisesLogged: false,
  alreadyRecorded: false,
};

describe("home session auto-save", () => {
  it("saves once the session clock has run to the end", () => {
    expect(shouldAutoSaveHomeSession(finishedByClock)).toBe(true);
  });

  it("saves once every exercise is logged, even with time left on the clock", () => {
    expect(
      shouldAutoSaveHomeSession({
        ...finishedByClock,
        elapsedSeconds: 20 * 60,
        allExercisesLogged: true,
      }),
    ).toBe(true);
  });

  it("doesn't save a session that is still in progress", () => {
    expect(
      shouldAutoSaveHomeSession({ ...finishedByClock, elapsedSeconds: 44 * 60 }),
    ).toBe(false);
  });

  it("doesn't save twice", () => {
    expect(shouldAutoSaveHomeSession({ ...finishedByClock, alreadyRecorded: true })).toBe(
      false,
    );
  });

  it("waits until the day's saved timer is restored", () => {
    expect(shouldAutoSaveHomeSession({ ...finishedByClock, timerLoaded: false })).toBe(false);
  });

  it("only applies to home training sessions", () => {
    expect(shouldAutoSaveHomeSession({ ...finishedByClock, environment: "gym" })).toBe(false);
    expect(
      shouldAutoSaveHomeSession({ ...finishedByClock, isTrainingSession: false }),
    ).toBe(false);
    expect(shouldAutoSaveHomeSession({ ...finishedByClock, sessionId: "" })).toBe(false);
  });

  it("doesn't treat a session with no length as finished by the clock", () => {
    expect(
      shouldAutoSaveHomeSession({ ...finishedByClock, totalSeconds: 0, elapsedSeconds: 0 }),
    ).toBe(false);
  });
});

describe("isSessionRecorded", () => {
  const log = (overrides: Partial<WorkoutLog>): WorkoutLog => ({
    id: "log",
    sessionDate: "2026-10-19",
    sessionId: "monday-core",
    exercisesCompleted: [],
    completedSession: true,
    effort: "push",
    notes: "",
    ...overrides,
  });

  it("finds a completed log for the same session and day", () => {
    expect(isSessionRecorded([log({})], "monday-core", "2026-10-19")).toBe(true);
  });

  // A session with no exercises has an empty exercisesCompleted list; the check
  // must still see it as saved, or it would be saved again on every render.
  it("counts a completed log even when it lists no exercises", () => {
    expect(
      isSessionRecorded([log({ exercisesCompleted: [] })], "monday-core", "2026-10-19"),
    ).toBe(true);
  });

  it("ignores other days, other sessions and unfinished logs", () => {
    expect(isSessionRecorded([log({ sessionDate: "2026-10-18" })], "monday-core", "2026-10-19")).toBe(false);
    expect(isSessionRecorded([log({ sessionId: "other" })], "monday-core", "2026-10-19")).toBe(false);
    expect(isSessionRecorded([log({ completedSession: false })], "monday-core", "2026-10-19")).toBe(false);
  });
});

describe("home session complete note", () => {
  // The reported case: a 60-minute session finished with 15 minutes on the
  // timer showed "15:00" inside a full ring.
  it("labels the time the timer ran", () => {
    expect(getHomeSessionCompleteNote(15 * 60)).toBe("15 min · everything is logged");
  });

  it("rounds to whole minutes", () => {
    expect(getHomeSessionCompleteNote(14 * 60 + 31)).toBe("15 min · everything is logged");
    expect(getHomeSessionCompleteNote(60 * 60)).toBe("60 min · everything is logged");
  });

  it("names the plan when the session finished early", () => {
    expect(getHomeSessionCompleteNote(17 * 60, 60 * 60)).toBe("17 of 60 min · all logged");
    expect(getHomeSessionCompleteNote(62 * 60, 60 * 60)).toBe("62 min · everything is logged");
  });

  it("leaves the time out when the timer barely ran", () => {
    expect(getHomeSessionCompleteNote(0)).toBe("Nice work, everything is logged");
    expect(getHomeSessionCompleteNote(29)).toBe("Nice work, everything is logged");
  });
});
