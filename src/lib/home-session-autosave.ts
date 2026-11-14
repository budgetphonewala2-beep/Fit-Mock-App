import type { WorkoutLog } from "@/lib/types";

// A home session counts as a finished workout once its clock has run to the
// end or every exercise in it has a logged set (the two ways the screen shows
// "Session complete"), so it's saved without asking. Before this, finishing
// recorded nothing: the session looked complete but never reached the workout
// history that drives the streak, Daily wins and challenges, unless the user
// found the "mark today's workout complete?" prompt behind the Done card.

export type HomeSessionAutoSaveInput = {
  environment: "home" | "gym";
  // The day's saved timer has been restored, so elapsed time is real and not
  // a stale value from another date.
  timerLoaded: boolean;
  // Only a normal training day has a session clock; rest and custom-routine
  // days don't.
  isTrainingSession: boolean;
  sessionId: string;
  elapsedSeconds: number;
  totalSeconds: number;
  allExercisesLogged: boolean;
  alreadyRecorded: boolean;
};

export function shouldAutoSaveHomeSession(input: HomeSessionAutoSaveInput) {
  return (
    input.environment === "home" &&
    input.timerLoaded &&
    input.isTrainingSession &&
    input.sessionId !== "" &&
    ((input.totalSeconds > 0 && input.elapsedSeconds >= input.totalSeconds) ||
      input.allExercisesLogged) &&
    !input.alreadyRecorded
  );
}

// Whether this day's session is already in the workout history as completed.
// Checked against the saved log itself rather than per-exercise flags, so a
// session with no listed exercises can't be saved over and over.
export function isSessionRecorded(
  workoutLogs: WorkoutLog[],
  sessionId: string,
  sessionDate: string,
) {
  return workoutLogs.some(
    (log) =>
      log.sessionDate === sessionDate &&
      log.sessionId === sessionId &&
      log.completedSession,
  );
}

// The pinned bar's subtitle once the session is complete. The ring shows a
// check (the session is done), and the time the timer actually ran goes here
// with a label: a "15:00" inside a full ring read as a broken 60-minute clock.
// Without a minute on the clock (every step ticked off by hand) there's no
// time worth showing. A session wrapped up early names the plan too, so
// "17 min" next to a 60-minute timeline reads as a short session, not a typo.
export function getHomeSessionCompleteNote(elapsedSeconds: number, plannedSeconds = 0) {
  const minutes = Math.round(elapsedSeconds / 60);
  const plannedMinutes = Math.round(plannedSeconds / 60);
  if (minutes < 1) {
    return "Nice work, everything is logged";
  }
  if (plannedMinutes > minutes) {
    return `${minutes} of ${plannedMinutes} min · all logged`;
  }
  return `${minutes} min · everything is logged`;
}
