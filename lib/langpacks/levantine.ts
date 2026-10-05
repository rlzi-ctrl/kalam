// Language pack: everything Levantine-specific lives here (CLAUDE.md non-negotiable #6).
import { SOUNDS, soundRulesPromptBlock } from "./sounds";

// Standard Arabic letters plus tatweel. Persian/Urdu letters (ک ی ے ھ پ چ گ ...) fall outside it.
const ARABIC_LETTER = /[\u0621-\u063A\u0640-\u064A]/;
const ANY_LETTER = /\p{L}/u;

/**
 * Why a transcript should be left out of consensus grading, or null if it is usable.
 * A transcript with any non-Arabic letter (Latin, Persian/Urdu, ...) means the STT
 * drifted out of Arabic, so none of it is trusted.
 */
function transcriptProblem(text: string): string | null {
  if (!text.trim()) return "empty transcript";
  const foreign = [...new Set([...text].filter((ch) => ANY_LETTER.test(ch) && !ARABIC_LETTER.test(ch)))];
  if (foreign.length === 0) return null;
  const latin = foreign.some((ch) => /[A-Za-z]/.test(ch));
  const other = foreign.some((ch) => !/[A-Za-z]/.test(ch));
  const kind = latin && other ? "Latin and non-Arabic letters" : latin ? "Latin letters" : "non-Arabic letters";
  return `contains ${kind}: ${foreign.slice(0, 8).join(" ")}`;
}

/**
 * Comparison form of an Arabic transcript: drops vowel marks, tatweel and punctuation and
 * folds common spelling variants (أ/إ/آ → ا, ة → ه, ى → ي), so two STT outputs that differ
 * only in spelling count as agreeing.
 */
function normalizeForComparison(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const levantine = {
  id: "levantine",
  name: "Levantine Arabic",
  /** ISO 639-1 code passed to STT providers. */
  sttLanguage: "ar",
  defaultAzureLocales: ["ar-JO", "ar-LB", "ar-SY"],
  /** Azure counts as one consensus vote; this locale wins when the Azure locales disagree. */
  preferredAzureLocale: "ar-JO",
  transcriptProblem,
  normalizeForComparison,
  sounds: SOUNDS,
  soundRules: soundRulesPromptBlock,
  /** Rules for turning English into a Levantine sentence (Say it mode). */
  sayRules: `You translate English sentences into natural spoken Levantine Arabic (neutral "white" register, Jordanian-leaning, as in the learner's tutor notes) for an English-speaking beginner.

Return:
- translit: Latin-script Arabizi in the learner's style (3=ع, 2=ء, lowercase, hyphens before attached pronoun suffixes where the notes use them). Say mine: whenever a word is in the learner's vocabulary list, use exactly the learner's preferred form and spelling shown there, even when it is MSA-leaning (e.g. asdiqaa, ela). Follow the spelling style of the example answers below.
- arabic: the same Levantine sentence in normal Arabic spelling (قديمة, not أديمة).
- tts_spelling: the same sentence in Arabic script, spelled the way a Levantine speaker actually pronounces it, so a text-to-speech voice reads it in dialect rather than MSA. Write what is said, following translit: ق pronounced as a glottal stop becomes ء/أ (أديمة for قديمة), ث → ت or س, ذ → د or ز, ظ → ض or ز, as the word is actually said. Add short-vowel marks only where a reader would otherwise pick the MSA vowel (بِدّي). Arabic letters only, never Latin.
- words: the sentence word by word, in order. Each entry: en (short English gloss of that word in context), translit, arabic, tts_spelling, known (true if the word, or the verb it is a form of, is in the learner's vocabulary list), concept_id (the [id] of that vocabulary entry, or "" if none), other_forms (up to 2 other common ways people say this word, with register levantine / msa / regional; [] if there are none worth knowing). Treat a word with attached prefixes/suffixes (b-, la-, 3a-, -ak, -ha ...) as one word.
- notes: one short sentence on anything worth knowing (a common alternative, a gender choice you made, a word outside the vocabulary). Empty string if nothing.

Grammar: statements take the b- present prefix (ana baroh, howa byakol); the verb is bare after bedi / lazem / rah / mumkin / ma bedi. For words that are not in the vocabulary list, use Levantine forms rather than MSA (no sawfa, laysa). If "you" is ambiguous, use masculine and say so in notes.`,
  graderRubric: `You are a strict but kind examiner of spoken Levantine Arabic (Jordanian / Palestinian / Syrian / Lebanese, neutral "white" register) for an English-speaking beginner.

Rules:
1. Grade meaning and dialect correctness, not spelling. Speech-to-text (STT) transcripts are in Arabic script; Arabic spelling variation (ة/ه, ى/ي, hamza seats, missing shadda) is never an error. When comparing transliterations, treat 3=ع, 7=ح, 2=ء, 5/kh=خ, gh=غ, doubled vowels, ee/i, oo/u/o, hyphens vs spaces and optional al-/il- as equivalent.
2. Say mine, recognize theirs. Every form listed under accepted_variants is correct, with no penalty, whatever its register (Levantine, MSA or regional): never list it as an error. Other MSA forms (sawfa, laysa, madha, ...) are "understandable but MSA": record them as error type msa_form, give only a small vocabulary deduction, and give the learner's preferred form. Do not mark them as wrong meaning.
3. The b- present prefix: statements take it (ana barooh, howa byakol, heya btishrab). After bedi / lazem / rah / ba3ref / mumkin / ma bedi the verb is bare (bedi aroh). A missing b- in a statement is a gentle conjugation note, not a heavy penalty.
4. Check pronoun suffixes (-i, -ak, -ik, -o/-oh, -ha, -na, -kon, -hom), gender agreement, kan for past "to be", rah for future, and ma/mish for negation.
5. STT caveat: STT systems often auto-correct a learner's mistakes into proper Arabic, and sometimes garble correct speech. Do not invent pronunciation errors. In fluency_note, say only what the transcript supports (missing words, truncation, repeated words, gibberish) and say plainly when you cannot tell whether a problem came from the learner or from the STT. Never claim to have heard the audio.
6. In fix fields and corrected_translit use the learner's preferred form of each word (the vocabulary list below shows preferred forms). If you must use a word they don't know, keep it common Levantine.
7. corrected_translit uses the learner's style: Latin Arabizi with 3/7/2, no diacritics. corrected_arabic is Arabic script for the same sentence.
8. overall is roughly 50% meaning + 30% grammar + 20% vocabulary. An empty, unrelated or unintelligible transcript gets meaning below 20.
9. errors: list each distinct problem once; learner = the fragment as heard, fix = the corrected fragment, tip = one short sentence in English. An empty list is fine when the sentence is correct.
10. encouragement: one short line in English.`,
};

export type LanguagePack = typeof levantine;
