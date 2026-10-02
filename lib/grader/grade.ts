import Anthropic from "@anthropic-ai/sdk";
import { levantine } from "@/lib/langpacks/levantine";
import type { TestPrompt } from "@/lib/seed";
import { buildSystemPrompt, buildUserMessage } from "./prompt";
import { GRADE_JSON_SCHEMA, ModelGradeSchema, type Grade } from "./schema";

export const graderModel = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export type GradeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type GradeOutcome = { grade: Grade; model: string; usage: GradeUsage; attempts: number };

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export async function gradeTranscript(
  prompt: TestPrompt,
  transcript: string,
  providerLabel: string,
): Promise<GradeOutcome> {
  const usage: GradeUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  let lastError = "";

  // Validate JSON; retry once on parse/validation failure (CLAUDE.md grader spec).
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await anthropic().beta.messages.create({
      model: graderModel(),
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: GRADE_JSON_SCHEMA },
      },
      system: [
        { type: "text", text: buildSystemPrompt(levantine), cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: buildUserMessage(prompt, transcript, providerLabel) }],
    });

    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    usage.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      throw new Error(`Grader refused (${response.stop_details?.category ?? "no category"})`);
    }

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    try {
      const parsed = ModelGradeSchema.parse(JSON.parse(text));
      return { grade: { ...parsed, heard: transcript }, model: response.model, usage, attempts: attempt };
    } catch (err) {
      lastError = `${err instanceof Error ? err.message : String(err)} (stop_reason: ${response.stop_reason})`;
    }
  }
  throw new Error(`Grader returned invalid JSON twice: ${lastError}`);
}
