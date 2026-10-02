import type { Grade } from "@/lib/grader/schema";
import type { GradeUsage } from "@/lib/grader/grade";
import type { TestPrompt } from "@/lib/seed";

export type GradeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; grade: Grade; model: string; ms: number; usage: GradeUsage; attempts: number }
  | { status: "error"; error: string };

export type ProviderResult =
  | { status: "unconfigured"; missing: string[] }
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string; ms?: number }
  | { status: "done"; text: string; note?: string; ms: number };

export type Row = {
  id: string;
  label: string;
  result: ProviderResult;
  grade: GradeState;
};

/** Plain-text dump of the current prompt's comparison, for pasting elsewhere. */
export function formatResultsText(
  prompt: TestPrompt,
  rows: Row[],
  audioSeconds: number | null,
  now: Date = new Date(),
): string {
  const out: string[] = [];
  out.push(`Kalam Phase 0 STT comparison — ${now.toISOString()}`);
  out.push(`Prompt ${prompt.id} (${prompt.kind}): ${prompt.en}`);
  if (prompt.referenceTranslit) out.push(`Seed transliteration: ${prompt.referenceTranslit}`);
  if (prompt.tutorPartial) out.push(`Tutor partial: ${prompt.tutorPartial}`);
  out.push(`Clip length: ${audioSeconds == null ? "no recording" : `${audioSeconds.toFixed(1)} s`}`);

  for (const row of rows) {
    out.push("", `=== ${row.label} ===`);
    const r = row.result;
    switch (r.status) {
      case "unconfigured":
        out.push(`not configured (missing ${r.missing.join(", ")})`);
        continue;
      case "idle":
        out.push("not run");
        continue;
      case "loading":
        out.push("still transcribing");
        continue;
      case "error":
        out.push(`STT error${r.ms != null ? ` after ${r.ms} ms` : ""}: ${r.error}`);
        continue;
      case "done":
        out.push(`Latency: ${r.ms} ms`);
        out.push(`Transcript: ${r.text || "(empty)"}`);
        if (r.note) out.push(`Note: ${r.note}`);
    }
    const g = row.grade;
    if (g.status === "done") {
      const u = g.usage;
      out.push(
        `Grade (${g.model}, ${g.ms} ms, tokens in/out ${u.input_tokens}/${u.output_tokens}, cache read ${u.cache_read_input_tokens}):`,
      );
      out.push(JSON.stringify(g.grade, null, 2));
    } else if (g.status === "error") {
      out.push(`Grade error: ${g.error}`);
    } else {
      out.push(`Grade: ${g.status === "loading" ? "in progress" : "not graded"}`);
    }
  }
  return out.join("\n");
}
