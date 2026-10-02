import seed from "@/levantine_seed.json";
import { structuredCall } from "@/lib/claude/structured";
import { levantine } from "@/lib/langpacks/levantine";
import { vocabForGrader } from "@/lib/seed";
import { SAY_JSON_SCHEMA, SayOutputSchema, type SayOutput } from "./schema";

const EXAMPLE_COUNT = 6;

/** A few answer keys from the seed, so generated spellings match their style. */
function styleExamples(): string {
  return seed.practice_sentences
    .slice(0, EXAMPLE_COUNT)
    .map((s) => `English: ${s.en}\ntranslit: ${s.answer_key.translit}\narabic: ${s.answer_key.arabic}`)
    .join("\n\n");
}

export function buildSaySystemPrompt(): string {
  return `${levantine.sayRules}

<learner_known_vocabulary>
Format: English = transliteration (Arabic, when the notes have it).
${vocabForGrader()}
</learner_known_vocabulary>

<example_answers>
${styleExamples()}
</example_answers>`;
}

/** Rejects output whose Arabic fields contain Latin or non-Arabic letters. */
export function checkSayOutput(out: SayOutput): string | null {
  const fields: [string, string][] = [
    ["arabic", out.arabic],
    ["tts_spelling", out.tts_spelling],
    ...out.words.flatMap((w, i): [string, string][] => [
      [`words[${i}].arabic`, w.arabic],
      [`words[${i}].tts_spelling`, w.tts_spelling],
    ]),
  ];
  for (const [name, value] of fields) {
    const problem = levantine.transcriptProblem(value);
    if (problem) return `${name} ${problem}`;
  }
  return null;
}

export async function generateSentence(english: string, model: string) {
  return structuredCall({
    model,
    system: buildSaySystemPrompt(),
    user: `<english>${english}</english>`,
    jsonSchema: SAY_JSON_SCHEMA,
    schema: SayOutputSchema,
    effort: "medium",
    check: checkSayOutput,
  });
}
