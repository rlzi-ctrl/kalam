import seed from "@/levantine_seed.json";

export type TestPrompt = {
  id: string;
  kind: "phrase" | "sentence";
  en: string;
  /** Full transliteration from the seed (phrases only). */
  referenceTranslit?: string;
  /** Partial answer the tutor wrote in the notes (some sentences). */
  tutorPartial?: string;
};

type SeedPhrase = { en: string; translit: string };
type SeedSentence = { en: string; partial_translit_from_tutor?: string };

// Phase 0 test set, chosen by English prefix so the seed file stays the source of truth.
const PHRASE_PREFIXES = [
  "I like this",
  "This is my food",
  "I don't want to go anywhere",
  "I play with my kids",
  "He sees her",
  "Please bring the bill",
  "Are you sure?",
  "Please repeat",
];

const SENTENCE_PREFIXES = [
  "Their car is very old",
  "She was at the airport two hours ago",
  "We don't have enough money",
  "I wanted to travel with them last year",
  "We were thirsty after we walked",
  "Our kitchen is small",
  "If the weather is hot tomorrow",
];

function pick<T extends { en: string }>(items: T[], prefix: string): T {
  const found = items.find((i) => i.en.startsWith(prefix));
  if (!found) throw new Error(`Seed item not found for prefix: ${prefix}`);
  return found;
}

export const TEST_PROMPTS: TestPrompt[] = [
  ...PHRASE_PREFIXES.map((p, i): TestPrompt => {
    const item = pick(seed.phrases as SeedPhrase[], p);
    return { id: `p${i + 1}`, kind: "phrase", en: item.en, referenceTranslit: item.translit };
  }),
  ...SENTENCE_PREFIXES.map((p, i): TestPrompt => {
    const item = pick(seed.practice_sentences as SeedSentence[], p);
    return {
      id: `s${i + 1}`,
      kind: "sentence",
      en: item.en,
      tutorPartial: item.partial_translit_from_tutor,
    };
  }),
];

export function findPrompt(id: string): TestPrompt | undefined {
  return TEST_PROMPTS.find((p) => p.id === id);
}

/** Compact vocab list for the grader: one line per item, grouped by lesson. */
export function vocabForGrader(): string {
  return seed.vocab_by_lesson
    .map((lesson) => {
      const items = (lesson.items as { en: string; translit?: string; arabic?: string }[])
        .filter((i) => i.translit)
        .map((i) => `${i.en} = ${i.translit}${i.arabic ? ` (${i.arabic})` : ""}`)
        .join("; ");
      return `L${lesson.lesson}: ${items}`;
    })
    .join("\n");
}

export function grammarForGrader(): string {
  return JSON.stringify(seed.grammar);
}

export function reviewFlagsForGrader(): string {
  return (seed.review_flags as { item: string; note: string }[])
    .map((f) => `- ${f.item}: ${f.note}`)
    .join("\n");
}
