// Client-safe matching between Say it cards, answer-key sentences and reviewer recordings.
import { levantine } from "@/lib/langpacks/levantine";

/** "Why were you (m) late yesterday?" ≈ "why were you m late yesterday" */
export const normalizeEnglish = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Same Arabic sentence, ignoring vowel marks, punctuation and spelling variants. */
export const sameArabic = (a: string, b: string) => levantine.normalizeForComparison(a) === levantine.normalizeForComparison(b);

export type NativeRecording = { id: string; en: string; translit: string; arabic: string; recorded_at: string };

/** The reviewer recording for a card: same English sentence and the same Arabic as the reviewed key. */
export function recordingFor(card: { english: string; arabic: string }, recordings: NativeRecording[]) {
  const en = normalizeEnglish(card.english);
  const sameSentence = recordings.find((r) => normalizeEnglish(r.en) === en);
  if (!sameSentence) return { recording: undefined, outdated: false };
  return sameArabic(sameSentence.arabic, card.arabic)
    ? { recording: sameSentence, outdated: false }
    : // A native recording exists, but this card's Arabic differs (made before the review): re-say it.
      { recording: undefined, outdated: true };
}
