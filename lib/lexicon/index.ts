// Pure lexicon logic, shared by pages and routes ("say mine, recognize theirs").
import lexicon from "@/levantine_lexicon.json";
import type { Concept, LexiconOverrides, Variant } from "./types";

export type { Concept, LexiconOverrides, Register, Variant, VariantSource } from "./types";
export { emptyOverrides } from "./types";

export const baseConcepts = (): Concept[] => lexicon.concepts as Concept[];

/** Seed lexicon + the learner's additions and preferred choices. */
export function applyOverrides(base: Concept[], o: LexiconOverrides): Concept[] {
  const all = [...base, ...Object.values(o.concepts).filter((c) => !base.some((b) => b.id === c.id))];
  return all.map((c) => {
    const known = new Set(c.variants.map((v) => v.id));
    const variants = [...c.variants, ...(o.added[c.id] ?? []).filter((v) => !known.has(v.id))];
    const chosen = o.preferred[c.id];
    if (!chosen || !variants.some((v) => v.id === chosen)) return { ...c, variants };
    return { ...c, variants: variants.map((v) => ({ ...v, preferred: v.id === chosen })) };
  });
}

export function preferredVariant(c: Concept): Variant {
  return c.variants.find((v) => v.preferred) ?? c.variants[0];
}

export const otherVariants = (c: Concept): Variant[] => c.variants.filter((v) => !v.preferred);

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Lowercase tokens; hyphens/punctuation split; doubled vowels folded (asdiqaa ≈ asdiqa). */
export function translitTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[`'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((t) => t.replace(/([aeiou])\1+/g, "$1"));
}

// What can follow a word: a feminine/plural ending, a hamza or construct t, then a pronoun suffix.
const SUFFIX = /^(a|ea|e|een|in|at)?(2|t)?(i|ak|ik|o|oh|ha|na|kom|kon|hom|ni|ek)?$/;
const MIN_MATCH_LENGTH = 3;

/** Whether `text` contains `variant` as whole words (the last word may carry a pronoun suffix). */
export function containsForm(text: string, variant: string): boolean {
  const hay = translitTokens(text);
  const needle = translitTokens(variant);
  if (needle.length === 0 || needle.join("").length < MIN_MATCH_LENGTH) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    const head = needle.slice(0, -1).every((t, j) => hay[i + j] === t);
    const last = needle[needle.length - 1];
    const word = hay[i + needle.length - 1];
    if (head && word.startsWith(last) && SUFFIX.test(word.slice(last.length))) return true;
  }
  return false;
}

export type NonPreferredUse = { concept: Concept; used: Variant; preferred: Variant };

/**
 * Non-preferred variants used in a transliterated sentence. Heuristic (whole-word match), used to flag
 * answer keys and cards that should be refreshed; very short forms like "3a" are not checked.
 */
export function findNonPreferred(translit: string, concepts: Concept[]): NonPreferredUse[] {
  const found: NonPreferredUse[] = [];
  for (const concept of concepts) {
    const preferred = preferredVariant(concept);
    if (containsForm(translit, preferred.translit)) continue;
    const used = otherVariants(concept).find((v) => containsForm(translit, v.translit));
    if (used) found.push({ concept, used, preferred });
  }
  return found;
}

/** Grader/Say-it prompt block: every concept with more than one form. */
export function variantsPromptBlock(concepts: Concept[]): string {
  return concepts
    .filter((c) => c.variants.length > 1)
    .map((c) => {
      const p = preferredVariant(c);
      const others = otherVariants(c).map((v) => `${v.translit} (${v.arabic}, ${v.register})`);
      return `${c.id} | ${c.en}: preferred ${p.translit} (${p.arabic}); also accepted: ${others.join("; ")}`;
    })
    .join("\n");
}

/** Learner's vocabulary in their preferred forms, grouped by lesson. */
export function vocabPromptBlock(concepts: Concept[]): string {
  const byLesson = new Map<string, string[]>();
  for (const c of concepts) {
    const key = c.lesson == null ? (c.id.startsWith("p-") ? "Phrases" : "Added") : `L${c.lesson}`;
    const p = preferredVariant(c);
    byLesson.set(key, [...(byLesson.get(key) ?? []), `${c.en} = ${p.translit} (${p.arabic})`]);
  }
  return [...byLesson.entries()].map(([k, items]) => `${k}: ${items.join("; ")}`).join("\n");
}
