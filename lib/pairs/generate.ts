import { structuredCall } from "@/lib/claude/structured";
import { levantine } from "@/lib/langpacks/levantine";
import type { Sound } from "@/lib/langpacks/sounds";
import { vocabPromptBlock, type Concept } from "@/lib/lexicon";
import { PAIRS_JSON_SCHEMA, PairCandidatesSchema } from "./schema";

const SYSTEM = `You build minimal-pair listening drills for an English speaker learning spoken ${levantine.dialect} Arabic. A minimal pair is two real words that differ only in one sound. Use common everyday words, preferring the learner's vocabulary (below). Both words must be real and their glosses correct: if you are not sure a word exists, leave the pair out. Fewer good pairs beat more doubtful ones. tts_spelling: the word in Arabic script spelled as a speaker of that dialect says it, with vowel marks, so a text-to-speech voice keeps the contrast. translit in the learner's Arabizi style (3=ع, 7=ح, 5/kh=خ, gh=غ, 6=ط, 9=ص, 2=ء). note: one short line on the difference.`;

export async function generatePairs(sound: Sound, concepts: Concept[], model: string, count = 6) {
  const system = `${SYSTEM}\n\n<learner_known_vocabulary>\n${vocabPromptBlock(concepts)}\n</learner_known_vocabulary>`;
  const user = `Make up to ${count} minimal pairs for ${sound.letters.join("/")} (${sound.symbol}, ${sound.name}) against ${sound.heardAs
    .filter((h) => !h.startsWith("("))
    .join(" or ")} — the sound learners tend to say instead. "target" has ${sound.letters[0]}, "contrast" has the other sound.${
    sound.id === "qaf" ? " Write the target's tts_spelling with ء for ق, the way Levantine speakers say it (قلب → ألب)." : ""
  }`;
  const result = await structuredCall({
    model,
    system,
    user,
    jsonSchema: PAIRS_JSON_SCHEMA,
    schema: PairCandidatesSchema,
    effort: "medium",
    check: (out) => {
      for (const p of out.pairs) {
        for (const w of [p.target, p.contrast]) {
          const problem = levantine.transcriptProblem(w.arabic) ?? levantine.transcriptProblem(w.tts_spelling);
          if (problem) return `${w.translit}: ${problem}`;
        }
      }
      return null;
    },
  });
  return result.data.pairs;
}
