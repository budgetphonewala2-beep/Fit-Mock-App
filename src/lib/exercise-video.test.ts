import { describe, expect, it } from "vitest";
import { findExerciseVideo } from "@/lib/exercise-video";

const FOCUSES = ["back", "biceps", "chest", "core", "legs", "shoulders", "triceps"];

describe("exercise video lookup", () => {
  // The reported gap: most warm-up moves showed a stick figure. Every day's
  // warm-up is now built from filmed clips.
  it("has a clip for every warm-up move on every day", () => {
    for (const focus of FOCUSES) {
      for (let slot = 1; slot <= 4; slot += 1) {
        expect(findExerciseVideo(`warmup-${focus}-${slot}-preset`, undefined), `${focus} ${slot}`)
          .toMatch(/\/videos\/warmup\/[a-z0-9-]+\.mp4$/);
      }
    }
  });

  it("plays the filmed clip for each new move", () => {
    const filmed: Array<[string, string]> = [
      ["warmup-back-3-preset", "bodyweight-rows"],
      ["warmup-core-2-preset", "floor-reverse-crunches"],
      ["warmup-legs-3-preset", "side-lunges"],
      ["warmup-shoulders-4-preset", "lateral-shoulder-swings"],
      ["warmup-triceps-2-preset", "dynamic-triceps-warm-up"],
    ];

    for (const [id, clip] of filmed) {
      expect(findExerciseVideo(id, undefined)).toMatch(new RegExp(`/warmup/${clip}\\.mp4$`));
    }
  });

  it("reuses one clip for a move shared across days", () => {
    expect(findExerciseVideo("warmup-back-2-preset", undefined)).toBe(
      findExerciseVideo("warmup-core-1-preset", undefined),
    );
    expect(findExerciseVideo("warmup-shoulders-2-preset", undefined)).toBe(
      findExerciseVideo("warmup-chest-2-preset", undefined),
    );
  });

  it("falls back to the move name when the id has no clip", () => {
    expect(findExerciseVideo("warmup-some-new-move", "Arm Circles")).toMatch(
      /warmup\/warmup-chest-2\.mp4$/,
    );
    expect(findExerciseVideo("warmup-some-new-move", "  leg swings ")).toMatch(
      /stretch\/stretch-3\.mp4$/,
    );
  });

  it("keeps the strength Walking Lunges name on its own clip", () => {
    expect(findExerciseVideo(undefined, "Walking Lunges")).toMatch(/leg-day\/walking-lunge\.mp4$/);
  });

  it("returns nothing for an exercise that hasn't been filmed", () => {
    expect(findExerciseVideo("not-a-real-move", "Not A Real Move")).toBeUndefined();
  });
});
