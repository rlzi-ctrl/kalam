import { describe, expect, it } from "vitest";
import { GRADE_JSON_SCHEMA, ModelGradeSchema } from "@/lib/grader/schema";

const sample = {
  meaning: 104,
  grammar: 70.4,
  vocabulary: -3,
  fluency_note: "Transcript looks complete.",
  corrected_translit: "ana baheb haad",
  corrected_arabic: "أنا بحب هاد",
  errors: [{ type: "conjugation", learner: "ana aheb", fix: "ana baheb", tip: "Statements take b-." }],
  overall: 80,
  encouragement: "Nice!",
  consensus_note: "Two of three transcripts agreed.",
};

describe("grade schema", () => {
  it("clamps and rounds scores", () => {
    const g = ModelGradeSchema.parse(sample);
    expect([g.meaning, g.grammar, g.vocabulary]).toEqual([100, 70, 0]);
  });

  it("rejects unknown error types", () => {
    expect(() =>
      ModelGradeSchema.parse({ ...sample, errors: [{ ...sample.errors[0], type: "spelling" }] }),
    ).toThrow();
  });

  it("keeps the JSON schema's required keys in step with the zod schema", () => {
    expect([...GRADE_JSON_SCHEMA.required].sort()).toEqual(Object.keys(ModelGradeSchema.shape).sort());
  });
});
