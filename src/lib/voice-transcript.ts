// Builds the meal transcript from SpeechRecognition results.
//
// Android's recognizer (Chrome and the app's WebView) doesn't hand back clean,
// separate phrases in continuous mode: a later result often repeats an earlier
// one with more words on the end ("a bread", then "a bread roll"), and the
// in-progress text repeats the last final. Appending each result, as the page
// used to, turned "a bread roll filled with" into "a breada bread
// rollfilledfilled withfilled with". So the whole transcript is rebuilt from
// every result on each event, folding repeats into the longer phrase and
// putting a space between phrases.

function normalize(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

/** Joins speech phrases in order, folding repeated or extended phrases. */
export function joinSpeechPhrases(phrases: string[]): string {
  const kept: string[] = [];

  for (const raw of phrases) {
    const phrase = normalize(raw);
    if (!phrase) continue;

    const last = kept[kept.length - 1];
    if (last !== undefined) {
      const lastLower = last.toLowerCase();
      const phraseLower = phrase.toLowerCase();

      // "a bread" then "a bread roll": the recognizer extended the phrase.
      if (phraseLower.startsWith(lastLower)) {
        kept[kept.length - 1] = phrase;
        continue;
      }
      // "a bread roll" then "roll" or the same phrase again: already said.
      if (lastLower.endsWith(phraseLower)) {
        continue;
      }
    }
    kept.push(phrase);
  }

  return kept.join(" ");
}

type SpeechResultLike = { 0: { transcript: string } };

/**
 * The transcript so far: `committed` holds what earlier recognition sessions
 * heard (the page restarts recognition after pauses), and `results` is the
 * current session's full result list.
 */
export function buildVoiceTranscript(
  committed: string,
  results: ArrayLike<SpeechResultLike>,
): string {
  const phrases = Array.from(results, (result) => result[0].transcript);
  return joinSpeechPhrases([committed, ...phrases]);
}
