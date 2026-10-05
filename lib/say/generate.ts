import seed from "@/levantine_seed.json";
import { structuredCall } from "@/lib/claude/structured";
import { levantine } from "@/lib/langpacks/levantine";
import { preferredVariant, type Concept } from "@/lib/lexicon";
import { SAY_JSON_SCHEMA, SayOutputSchema, type SayOutput } from "./schema";

const EXAMPLE_COUNT = 6;

/** A few answer keys from the seed, so generated spellings match their style. */
function styleExamples(): string {
  return seed.practice_sentences
    .slice(0, EXAMPLE_COUNT)
    .map((s) => `English: ${s.en}\ntranslit: ${s.answer_key.translit}\narabic: ${s.answer_key.arabic}`)
    .join("\n\n");
}

/** Vocabulary in preferred forms, with ids so each word can point at its concept. */
function vocabWithIds(concepts: Concept[]): string {
  return concepts
    .map((c) => {
      const p = preferredVariant(c);
      return `[${c.id}] ${c.en} = ${p.translit} (${p.arabic})`;
    })
    .join("\n");
}

export function buildSaySystemPrompt(concepts: Concept[]): string {
  return `${levantine.sayRules}

<learner_known_vocabulary>
Format: [concept_id] English = preferred transliteration (Arabic).
${vocabWithIds(concepts)}
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

/** Drops concept ids the model invented and alternative forms that aren't usable Arabic. */
export function cleanSayOutput(out: SayOutput, concepts: Concept[]): SayOutput {
  const ids = new Set(concepts.map((c) => c.id));
  return {
    ...out,
    words: out.words.map((w) => ({
      ...w,
      concept_id: ids.has(w.concept_id) ? w.concept_id : "",
      other_forms: w.other_forms
        .filter((f) => f.translit.trim() && !levantine.transcriptProblem(f.arabic) && f.translit !== w.translit)
        .slice(0, 2),
    })),
  };
}

/**
 * With `fixed` (an answer key, possibly checked by the native reviewer), the sentence itself is given:
 * Claude only adds tts_spelling and the word breakdown, and translit/arabic are kept exactly.
 */
export async function generateSentence(
  english: string,
  model: string,
  concepts: Concept[],
  fixed?: { translit: string; arabic: string },
) {
  const user = fixed
    ? `<english>${english}</english>
<use_this_sentence>
translit: ${fixed.translit}
arabic: ${fixed.arabic}
</use_this_sentence>
This sentence is the reviewed answer key: copy translit and arabic exactly as given and derive tts_spelling and words from it. Do not change any word.`
    : `<english>${english}</english>`;
  const result = await structuredCall({
    model,
    system: buildSaySystemPrompt(concepts),
    user,
    jsonSchema: SAY_JSON_SCHEMA,
    schema: SayOutputSchema,
    effort: "medium",
    check: checkSayOutput,
  });
  const data = cleanSayOutput(result.data, concepts);
  return { ...result, data: fixed ? { ...data, translit: fixed.translit, arabic: fixed.arabic } : data };
}
