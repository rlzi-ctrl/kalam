import { z } from "zod";
import { SOUND_IDS } from "@/lib/langpacks/sounds";

export const PairWordSchema = z.object({
  arabic: z.string().min(1),
  translit: z.string().min(1),
  en: z.string().min(1),
  /** Spelled as pronounced, with vowel marks, so TTS keeps the contrast. */
  tts_spelling: z.string().min(1),
});

export const PairCandidatesSchema = z.object({
  pairs: z.array(
    z.object({
      /** The word with the practice sound. */
      target: PairWordSchema,
      /** The same word with the sound it gets confused with. */
      contrast: PairWordSchema,
      note: z.string(),
    }),
  ),
});

export type PairWord = z.infer<typeof PairWordSchema>;

export type MinimalPair = {
  id: string;
  sound: (typeof SOUND_IDS)[number];
  target: PairWord;
  contrast: PairWord;
  note: string;
  status: "unverified" | "verified" | "rejected";
  created_at: string;
  reviewed_at?: string;
};

const word = {
  type: "object",
  additionalProperties: false,
  required: ["arabic", "translit", "en", "tts_spelling"],
  properties: { arabic: { type: "string" }, translit: { type: "string" }, en: { type: "string" }, tts_spelling: { type: "string" } },
};

export const PAIRS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pairs"],
  properties: {
    pairs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["target", "contrast", "note"],
        properties: { target: word, contrast: word, note: { type: "string" } },
      },
    },
  },
};
