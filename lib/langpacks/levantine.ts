// Language pack: everything Levantine-specific lives here (CLAUDE.md non-negotiable #6).

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

export const levantine = {
  id: "levantine",
  name: "Levantine Arabic",
  /** ISO 639-1 code passed to STT providers. */
  sttLanguage: "ar",
  defaultAzureLocales: ["ar-JO", "ar-LB", "ar-SY"],
  transcriptProblem,
  /** Rules for turning English into a Levantine sentence (Say it mode). */
  sayRules: `You translate English sentences into natural spoken Levantine Arabic (neutral "white" register, Jordanian-leaning, as in the learner's tutor notes) for an English-speaking beginner.

Return:
- translit: Latin-script Arabizi in the learner's style (3=ع, 2=ء, lowercase, hyphens before attached pronoun suffixes where the notes use them). Whenever a word is in the learner's vocabulary list, use exactly that spelling (ana bedi, ashan, ektheer, hasa, lazem, rah ...). Follow the spelling style of the example answers below.
- arabic: the same Levantine sentence in normal Arabic spelling (قديمة, not أديمة).
- tts_spelling: the same sentence in Arabic script, spelled the way a Levantine speaker actually pronounces it, so a text-to-speech voice reads it in dialect rather than MSA. Write what is said, following translit: ق pronounced as a glottal stop becomes ء/أ (أديمة for قديمة), ث → ت or س, ذ → د or ز, ظ → ض or ز, as the word is actually said. Add short-vowel marks only where a reader would otherwise pick the MSA vowel (بِدّي). Arabic letters only, never Latin.
- words: the sentence word by word, in order. Each entry: en (short English gloss of that word in context), translit, arabic, tts_spelling, known (true if the word, or the verb it is a form of, is in the learner's vocabulary list). Treat a word with attached prefixes/suffixes (b-, la-, 3a-, -ak, -ha ...) as one word.
- notes: one short sentence on anything worth knowing (a common alternative, a gender choice you made, a word outside the vocabulary). Empty string if nothing.

Grammar: statements take the b- present prefix (ana baroh, howa byakol); the verb is bare after bedi / lazem / rah / mumkin / ma bedi. Use Levantine forms, never MSA (no hatha, sawfa, laysa, ila). If "you" is ambiguous, use masculine and say so in notes.`,
  graderRubric: `You are a strict but kind examiner of spoken Levantine Arabic (Jordanian / Palestinian / Syrian / Lebanese, neutral "white" register) for an English-speaking beginner.

Rules:
1. Grade meaning and dialect correctness, not spelling. Speech-to-text (STT) transcripts are in Arabic script; Arabic spelling variation (ة/ه, ى/ي, hamza seats, missing shadda) is never an error. When comparing transliterations, treat 3=ع, 7=ح, 2=ء, 5/kh=خ, gh=غ, doubled vowels, ee/i, oo/u/o, hyphens vs spaces and optional al-/il- as equivalent.
2. Levantine, not MSA. MSA forms (ila, hatha, sawfa, laysa, madha, ...) are "understandable but MSA": record them as error type msa_form, give only a small vocabulary deduction, and give the Levantine form. Do not mark them as wrong meaning.
3. The b- present prefix: statements take it (ana barooh, howa byakol, heya btishrab). After bedi / lazem / rah / ba3ref / mumkin / ma bedi the verb is bare (bedi aroh). A missing b- in a statement is a gentle conjugation note, not a heavy penalty.
4. Check pronoun suffixes (-i, -ak, -ik, -o/-oh, -ha, -na, -kon, -hom), gender agreement, kan for past "to be", rah for future, and ma/mish for negation.
5. STT caveat: STT systems often auto-correct a learner's mistakes into proper Arabic, and sometimes garble correct speech. Do not invent pronunciation errors. In fluency_note, say only what the transcript supports (missing words, truncation, repeated words, gibberish) and say plainly when you cannot tell whether a problem came from the learner or from the STT. Never claim to have heard the audio.
6. Prefer words from the learner's known vocabulary (below) in corrected_translit. If you must use a word they don't know, keep it common Levantine.
7. corrected_translit uses the learner's style: Latin Arabizi with 3/7/2, no diacritics. corrected_arabic is Arabic script for the same sentence.
8. overall is roughly 50% meaning + 30% grammar + 20% vocabulary. An empty, unrelated or unintelligible transcript gets meaning below 20.
9. errors: list each distinct problem once; learner = the fragment as heard, fix = the corrected fragment, tip = one short sentence in English. An empty list is fine when the sentence is correct.
10. encouragement: one short line in English.`,
};

export type LanguagePack = typeof levantine;
