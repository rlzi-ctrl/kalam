export type Register = "levantine" | "msa" | "regional";
export type VariantSource = "notes" | "generated" | "reviewer";

export type Variant = {
  id: string;
  /** Display form, as written by its source. */
  form: string;
  /** Learner-style transliteration. */
  translit: string;
  arabic: string;
  register: Register;
  source: VariantSource;
  preferred: boolean;
  /** Arabic spelled as pronounced, for TTS, when it differs from `arabic`. */
  tts?: string;
};

export type Concept = {
  id: string;
  en: string;
  lesson: number | null;
  variants: Variant[];
  /** Tutor-review flag copied from the seed. */
  review_flag?: string;
  note?: string;
};

/** The learner's changes on top of levantine_lexicon.json, stored in Blob. */
export type LexiconOverrides = {
  /** conceptId → preferred variantId. */
  preferred: Record<string, string>;
  /** Variants added to existing concepts (reviewer or Say it suggestions). */
  added: Record<string, Variant[]>;
  /** Concepts that are not in the seed (created from Say it words). */
  concepts: Record<string, Concept>;
};

export const emptyOverrides = (): LexiconOverrides => ({ preferred: {}, added: {}, concepts: {} });
