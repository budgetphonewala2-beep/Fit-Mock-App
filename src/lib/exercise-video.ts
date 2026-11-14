import { exerciseVideoById, exerciseVideoByName } from "@/lib/generated/exercise-video-map";

// One place to answer "which clip is this exercise?", so the session player and
// the exercise detail screen can never disagree about it. Presets carry ids;
// plan-generated and library exercises only reliably carry a name, so both are
// tried. Returns undefined when nothing matches -- the caller decides whether
// that means a placeholder clip or no video at all.
export function findExerciseVideo(exerciseId: string | undefined, exerciseName: string | undefined) {
  return (
    (exerciseId ? exerciseVideoById[exerciseId] : undefined) ??
    (exerciseName ? exerciseVideoByName[exerciseName.trim().toLowerCase()] : undefined)
  );
}

export const FALLBACK_EXERCISE_VIDEO = exerciseVideoById["pushups-demo-fallback"];
