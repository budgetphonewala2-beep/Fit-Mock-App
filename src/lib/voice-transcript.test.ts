import { describe, expect, it } from "vitest";
import { buildVoiceTranscript, joinSpeechPhrases } from "@/lib/voice-transcript";

const results = (...phrases: string[]) => phrases.map((transcript) => ({ 0: { transcript } }));

describe("voice transcript", () => {
  // The reported bug: Android repeats and extends phrases, and appending them
  // logged "a breada bread rollfilledfilled withfilled with".
  it("folds Android's repeated and extended phrases into one clean line", () => {
    expect(
      buildVoiceTranscript("", results("a bread", "a bread roll", "filled", "filled with", "filled with")),
    ).toBe("a bread roll filled with");
  });

  it("puts a space between separate phrases", () => {
    expect(joinSpeechPhrases(["2 roti", "dal", "and a bowl of rice"])).toBe(
      "2 roti dal and a bowl of rice",
    );
  });

  it("drops a phrase the previous one already ends with", () => {
    expect(joinSpeechPhrases(["paneer tikka", "tikka"])).toBe("paneer tikka");
  });

  it("ignores case and stray spaces when folding", () => {
    expect(joinSpeechPhrases(["  Bread  roll ", "bread roll with butter"])).toBe(
      "bread roll with butter",
    );
  });

  it("keeps what earlier sessions heard after a restart", () => {
    expect(buildVoiceTranscript("2 roti and dal", results("and curd"))).toBe(
      "2 roti and dal and curd",
    );
  });

  it("doesn't repeat the committed text when a new session starts over", () => {
    expect(buildVoiceTranscript("2 roti", results("2 roti and dal"))).toBe("2 roti and dal");
  });

  it("returns nothing for silence", () => {
    expect(buildVoiceTranscript("", results("", "  "))).toBe("");
  });
});
