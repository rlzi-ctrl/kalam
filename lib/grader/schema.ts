import { z } from "zod";

export const ERROR_TYPES = [
  "conjugation",
  "suffix",
  "gender",
  "msa_form",
  "word_choice",
  "word_order",
  "missing_word",
] as const;

const score = z.number().transform((n) => Math.max(0, Math.min(100, Math.round(n))));

/** What the model returns. `heard` is added by the server, not the model. */
export const ModelGradeSchema = z.object({
  meaning: score,
  grammar: score,
  vocabulary: score,
  fluency_note: z.string(),
  corrected_translit: z.string(),
  corrected_arabic: z.string(),
  errors: z.array(
    z.object({
      type: z.enum(ERROR_TYPES),
      learner: z.string(),
      fix: z.string(),
      tip: z.string(),
    }),
  ),
  overall: score,
  encouragement: z.string(),
});

export type Grade = z.infer<typeof ModelGradeSchema> & { heard: string };

const str = { type: "string" } as const;
const int = { type: "integer" } as const;

// JSON schema for structured outputs (kept in step with ModelGradeSchema above).
export const GRADE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "meaning",
    "grammar",
    "vocabulary",
    "fluency_note",
    "corrected_translit",
    "corrected_arabic",
    "errors",
    "overall",
    "encouragement",
  ],
  properties: {
    meaning: int,
    grammar: int,
    vocabulary: int,
    fluency_note: str,
    corrected_translit: str,
    corrected_arabic: str,
    errors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "learner", "fix", "tip"],
        properties: {
          type: { type: "string", enum: [...ERROR_TYPES] },
          learner: str,
          fix: str,
          tip: str,
        },
      },
    },
    overall: int,
    encouragement: str,
  },
};
