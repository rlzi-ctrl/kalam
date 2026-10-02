import { structuredCall, type ClaudeUsage } from "@/lib/claude/structured";
import type { Transcript } from "@/lib/consensus";
import { levantine } from "@/lib/langpacks/levantine";
import type { TestPrompt } from "@/lib/seed";
import { buildSystemPrompt, buildUserMessage } from "./prompt";
import { GRADE_JSON_SCHEMA, ModelGradeSchema, type Grade } from "./schema";

export type GradeUsage = ClaudeUsage;

export type GradeOutcome = { grade: Grade; model: string; usage: GradeUsage; attempts: number };

export async function gradeTranscripts(
  prompt: TestPrompt,
  transcripts: Transcript[],
  model: string,
): Promise<GradeOutcome> {
  const { data, ...rest } = await structuredCall({
    model,
    system: buildSystemPrompt(levantine),
    user: buildUserMessage(prompt, transcripts),
    jsonSchema: GRADE_JSON_SCHEMA,
    schema: ModelGradeSchema,
    effort: "low",
  });
  const heard = transcripts.length === 1 ? transcripts[0].text : transcripts.map((t) => `${t.label}: ${t.text}`).join("\n");
  const grade: Grade = { ...data, heard };
  if (prompt.answerKey) {
    // The key's exact spellings, whatever the model wrote.
    grade.corrected_translit = prompt.answerKey.translit;
    grade.corrected_arabic = prompt.answerKey.arabic;
  }
  return { grade, ...rest };
}
