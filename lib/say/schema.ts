import { z } from "zod";

export const SayWordSchema = z.object({
  en: z.string(),
  translit: z.string(),
  arabic: z.string(),
  tts_spelling: z.string(),
  known: z.boolean(),
});

export const SayOutputSchema = z.object({
  translit: z.string().min(1),
  arabic: z.string().min(1),
  tts_spelling: z.string().min(1),
  words: z.array(SayWordSchema).min(1),
  notes: z.string(),
});

export type SayWord = z.infer<typeof SayWordSchema>;
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
        required: ["en", "translit", "arabic", "tts_spelling", "known"],
        properties: { en: str, translit: str, arabic: str, tts_spelling: str, known: { type: "boolean" } },
      },
    },
    notes: str,
  },
};
