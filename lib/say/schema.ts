import { z } from "zod";

export const OtherFormSchema = z.object({
  translit: z.string(),
  arabic: z.string(),
  register: z.enum(["levantine", "msa", "regional"]),
});

export const SayWordSchema = z.object({
  en: z.string(),
  translit: z.string(),
  arabic: z.string(),
  tts_spelling: z.string(),
  known: z.boolean(),
  /** Lexicon concept this word is a form of, or "" (checked against the lexicon server-side). */
  concept_id: z.string().default(""),
  /** Other common ways to say it ("you'll also hear"): suggestions until the learner saves one. */
  other_forms: z.array(OtherFormSchema).default([]),
});

export const SayOutputSchema = z.object({
  translit: z.string().min(1),
  arabic: z.string().min(1),
  tts_spelling: z.string().min(1),
  words: z.array(SayWordSchema).min(1),
  notes: z.string(),
});

export type SayWord = z.infer<typeof SayWordSchema>;
export type OtherForm = z.infer<typeof OtherFormSchema>;
export type SayOutput = z.infer<typeof SayOutputSchema>;

const str = { type: "string" } as const;

export const SAY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["translit", "arabic", "tts_spelling", "words", "notes"],
  properties: {
    translit: str,
    arabic: str,
    tts_spelling: str,
    words: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["en", "translit", "arabic", "tts_spelling", "known", "concept_id", "other_forms"],
        properties: {
          en: str,
          translit: str,
          arabic: str,
          tts_spelling: str,
          known: { type: "boolean" },
          concept_id: str,
          other_forms: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["translit", "arabic", "register"],
              properties: { translit: str, arabic: str, register: { type: "string", enum: ["levantine", "msa", "regional"] } },
            },
          },
        },
      },
    },
    notes: str,
  },
};
