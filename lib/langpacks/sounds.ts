// Levantine sounds an English speaker has to learn. Part of the Levantine language pack.

export type SoundId = "hamza" | "ain" | "haa" | "khaa" | "ghain" | "taa" | "saad" | "qaf";

export type Sound = {
  id: SoundId;
  /** How the learner writes it in Arabizi. */
  symbol: string;
  name: string;
  /** Arabic letters that carry the sound. */
  letters: string[];
  tip: string;
  /** Short word to demo the sound with TTS (spelled as pronounced). */
  demo: { arabic: string; translit: string; en: string };
  /** What STT tends to write when the sound is missed: the likely swap. */
  heardAs: string[];
  swapNote: string;
};

export const SOUNDS: Sound[] = [
  {
    id: "hamza",
    symbol: "2",
    name: "hamza (glottal stop)",
    letters: ["ء", "أ", "إ", "ؤ", "ئ", "آ"],
    tip: "A tiny catch in the throat, like the break in \"uh-oh\". Close your throat for an instant, then let the vowel go.",
    demo: { arabic: "سأل", translit: "sa2al", en: "he asked" },
    heardAs: [],
    swapNote: "STT usually tidies hamza spelling, so it can't tell you much about this one.",
  },
  {
    id: "ain",
    symbol: "3",
    name: "ʿayn",
    letters: ["ع"],
    tip: "Squeeze the muscles deep in your throat, as if starting to gag very gently, and voice through them. It is a real consonant, not a silent letter.",
    demo: { arabic: "عين", translit: "3en", en: "eye" },
    heardAs: ["ا", "أ", "(missing)"],
    swapNote: "Missed ع often shows up as أ/ا, or the letter disappears.",
  },
  {
    id: "haa",
    symbol: "7",
    name: "ḥa (throaty h)",
    letters: ["ح"],
    tip: "A strong, breathy h from a narrowed throat, like breathing hard on glasses to clean them. No scrape, and stronger than English h (ه).",
    demo: { arabic: "حلو", translit: "7elo", en: "nice" },
    heardAs: ["ه"],
    swapNote: "A soft English-style h makes STT write ه instead of ح.",
  },
  {
    id: "khaa",
    symbol: "5 / kh",
    name: "kha",
    letters: ["خ"],
    tip: "Raise the back of your tongue toward the soft palate and let the air scrape through, as in Scottish \"loch\" or German \"Bach\". Don't close it into a k.",
    demo: { arabic: "خبز", translit: "5obez", en: "bread" },
    heardAs: ["ك", "ق", "ه"],
    swapNote: "If the air stops completely, STT hears ك or ق.",
  },
  {
    id: "ghain",
    symbol: "gh",
    name: "ghayn",
    letters: ["غ"],
    tip: "The voiced partner of kh: same place, but hum through it, like gargling or a French r.",
    demo: { arabic: "غالي", translit: "ghali", en: "expensive" },
    heardAs: ["ق", "ج", "ك", "ر"],
    swapNote: "Without the gargle, STT hears ق/ك or even ر.",
  },
  {
    id: "taa",
    symbol: "6",
    name: "emphatic t",
    letters: ["ط"],
    tip: "Tongue tip on the ridge behind your teeth, back of the tongue raised and pulled back. Vowels next to it sound deeper (ta → \"taw\"). Plain t is ت.",
    demo: { arabic: "طويل", translit: "6aweel", en: "tall" },
    heardAs: ["ت"],
    swapNote: "A plain t makes STT write ت instead of ط.",
  },
  {
    id: "saad",
    symbol: "9",
    name: "emphatic s",
    letters: ["ص"],
    tip: "Same idea as ط: back of the tongue raised, vowels around it deeper and darker. Plain s is س.",
    demo: { arabic: "صوت", translit: "9ot", en: "sound" },
    heardAs: ["س"],
    swapNote: "A plain s makes STT write س instead of ص.",
  },
  {
    id: "qaf",
    symbol: "q → 2",
    name: "qaf, the Levantine rule",
    letters: ["ق"],
    tip: "In urban Palestinian and Jordanian speech, ق is usually said as a glottal stop (2): قلب → 2alb, قديم → 2adeem. Many Jordanians (and rural Palestinians) say g instead. Your notes write q (qabel, aqdar); all of these are understood. Avoid a plain English k.",
    demo: { arabic: "ألب", translit: "2alb", en: "heart (قلب)" },
    heardAs: ["ك"],
    swapNote: "Only a k (ك) for ق is flagged: 2, q and g are all fine.",
  },
];

export const SOUND_IDS = SOUNDS.map((s) => s.id) as [SoundId, ...SoundId[]];

const LETTER_TO_SOUND = new Map(SOUNDS.flatMap((s) => s.letters.map((l) => [l, s.id] as const)));

/** The sound a character belongs to, if it is one of the practice sounds. */
export const soundOfLetter = (ch: string): SoundId | undefined => LETTER_TO_SOUND.get(ch);

export const soundById = (id: string): Sound | undefined => SOUNDS.find((s) => s.id === id);

/** Grader rules for spotting likely sound swaps across consensus transcripts. */
export function soundRulesPromptBlock(): string {
  const lines = SOUNDS.filter((s) => s.heardAs.length).map(
    (s) => `- ${s.id}: expected ${s.letters.join("/")} (${s.symbol}), a swap is heard as ${s.heardAs.join(" / ")}`,
  );
  return `sound_errors: likely pronunciation swaps of these sounds, only when the answer key (or reference) word has the sound and the agreeing transcripts (at least errors_need_agreement_of of them) show the swap in that same word:
${lines.join("\n")}
Never report hamza. For qaf, ء/أ, ق or g are all correct Levantine; report only ك. STT often "fixes" a learner's sounds, so report a swap only when transcripts show it, never because you suspect it. Each entry: sound (id), word (expected word in Arabic), heard (the word as transcribed), tip (one short sentence). Use [] when there is none.`;
}
