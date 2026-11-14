import { describe, expect, it } from "vitest";
import {
  challengeShareText,
  comebackShareText,
  dayFullyLoggedShareText,
  firstMealShareText,
  nutritionDayShareText,
  streakShareText,
  workoutShareText,
} from "@/lib/share-text";

const allTexts = [
  firstMealShareText("Day 1 streak started"),
  workoutShareText(45),
  streakShareText(7),
  challengeShareText("30-Day Protein"),
  nutritionDayShareText(),
  dayFullyLoggedShareText(),
  comebackShareText(),
];

describe("share text", () => {
  // The reported case: the first-meal message pasted in the raw logged meal
  // text, which ran to a paragraph on WhatsApp.
  it("keeps the first-meal message to one line plus the link", () => {
    expect(firstMealShareText("Day 1 streak started")).toBe(
      "🥗 First meal logged on Fitmonk. Day 1 streak started.\n\nfitmonk.online",
    );
  });

  it("ends every message with the link on its own line", () => {
    for (const text of allTexts) {
      expect(text.endsWith("\n\nfitmonk.online")).toBe(true);
    }
  });

  it("keeps every message to a single short line before the link", () => {
    for (const text of allTexts) {
      const [line, ...rest] = text.split("\n\n");
      expect(rest).toEqual(["fitmonk.online"]);
      expect(line.length).toBeLessThanOrEqual(60);
    }
  });

  it("puts the numbers in", () => {
    expect(workoutShareText(45)).toContain("45-min workout");
    expect(streakShareText(7)).toContain("7-day streak");
    expect(challengeShareText("Hydration Week")).toContain("Hydration Week challenge");
  });
});
