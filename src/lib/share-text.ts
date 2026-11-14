// The text that goes out with every celebration share. One format for all of
// them: an emoji, one short line, then the link on its own line. The story
// card carries the detail (calories, minutes, days), so the text stays short;
// before this, some messages pasted in the raw meal text, ran to three
// paragraphs, or had no link at all.

const LINK = "fitmonk.online";

function shareText(emoji: string, line: string) {
  return `${emoji} ${line}\n\n${LINK}`;
}

/** `streakLabel` is "Day 1 streak started" style, from formatStreakLabel. */
export function firstMealShareText(streakLabel: string) {
  return shareText("🥗", `First meal logged on Fitmonk. ${streakLabel}.`);
}

export function workoutShareText(minutes: number) {
  return shareText("💪", `${minutes}-min workout done on Fitmonk.`);
}

export function streakShareText(days: number) {
  return shareText("🔥", `${days}-day streak on Fitmonk.`);
}

/** `title` is the challenge's own name, e.g. "30-Day Protein". */
export function challengeShareText(title: string) {
  return shareText("🏆", `Completed the ${title} challenge on Fitmonk.`);
}

export function nutritionDayShareText() {
  return shareText("✅", "Hit my protein and water goals today on Fitmonk.");
}

export function dayFullyLoggedShareText() {
  return shareText("🍽️", "Ate my whole meal plan today on Fitmonk.");
}

export function comebackShareText() {
  return shareText("👋", "Back on Fitmonk, picking up where I left off.");
}
