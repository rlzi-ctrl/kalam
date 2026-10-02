import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

export type ClaudeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type StructuredResult<T> = { data: T; model: string; usage: ClaudeUsage; attempts: number };

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

/**
 * One Claude call with a JSON-schema output, validated with zod (plus an optional extra check).
 * Retries once on invalid output (CLAUDE.md grader spec); the system prompt is prompt-cached.
 */
export async function structuredCall<S extends z.ZodType>(opts: {
  model: string;
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  schema: S;
  effort: "low" | "medium" | "high";
  /** Return an error message to reject (and retry) output that parses but is unusable. */
  check?: (data: z.infer<S>) => string | null;
}): Promise<StructuredResult<z.infer<S>>> {
  const usage: ClaudeUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await anthropic().beta.messages.create({
      model: opts.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort, format: { type: "json_schema", schema: opts.jsonSchema } },
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.user }],
    });

    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    usage.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      throw new Error(`Claude refused (${response.stop_details?.category ?? "no category"})`);
    }

    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    try {
      const data = opts.schema.parse(JSON.parse(text));
      const problem = opts.check?.(data);
      if (problem) throw new Error(problem);
      return { data, model: response.model, usage, attempts: attempt };
    } catch (err) {
      lastError = `${err instanceof Error ? err.message : String(err)} (stop_reason: ${response.stop_reason})`;
    }
  }
  throw new Error(`Claude returned invalid output twice: ${lastError}`);
}
