import { selectForConsensus, type ConsensusOptions, type Discarded, type Skipped } from "@/lib/consensus";
import type { GradeUsage } from "@/lib/grader/grade";
import type { Grade } from "@/lib/grader/schema";
import type { TestPrompt } from "@/lib/seed";

export type GradeDone = {
  status: "done";
  requestedModel: string;
  /** Model that actually answered (differs if the refusal fallback kicked in). */
  model: string;
  grade: Grade;
  ms: number;
  usage: GradeUsage;
  attempts: number;
};

export type GradeState =
  | { status: "idle" }
  | { status: "loading"; requestedModel: string }
  | GradeDone
  | { status: "error"; requestedModel: string; error: string; ms?: number };

export type ConsensusRun = {
  key: string;
  used: string[];
  discarded: Discarded[];
  skipped: Skipped[];
  optIn: string[];
} & Exclude<GradeState, { status: "idle" }>;

export type ProviderResult =
  | { status: "unconfigured"; missing: string[] }
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string; ms?: number }
  | { status: "done"; text: string; note?: string; ms: number };

export type Row = {
  id: string;
  label: string;
  inConsensus: boolean;
  result: ProviderResult;
  /** Grade of this transcript on its own (optional; consensus is the default). */
  grade: GradeState;
};

export type PromptSession = {
  clip: { url: string; seconds: number } | null;
  rows: Row[];
  consensus: ConsensusRun[];
};

export function doneTranscripts(rows: Row[]) {
  return rows.flatMap((r) =>
    r.result.status === "done" ? [{ providerId: r.id, label: r.label, text: r.result.text }] : [],
  );
}

export const USED = "used in consensus";

/** Column badge: used in consensus, discarded (and why), skipped (and why), or not part of it. */
export function consensusStatus(rows: Row[], opts: ConsensusOptions = {}): Record<string, string> {
  const { used, discarded, skipped } = selectForConsensus(doneTranscripts(rows), opts);
  const status: Record<string, string> = {};
  for (const r of rows) if (!r.inConsensus) status[r.id] = "not in consensus";
  for (const t of used) status[t.providerId] = USED;
  for (const d of discarded) status[d.providerId] = `discarded: ${d.reason}`;
  for (const s of skipped) status[s.providerId] = `not counted: ${s.reason}`;
  return status;
}

export function hasResults(s: PromptSession | undefined): boolean {
  return Boolean(s && (s.clip || s.consensus.length || s.rows.some((r) => r.result.status === "done" || r.result.status === "error")));
}

function gradeLines(g: GradeState, title: string): string[] {
  switch (g.status) {
    case "idle":
      return [];
    case "loading":
      return [`${title} (${g.requestedModel}): in progress`];
    case "error":
      return [`${title} (${g.requestedModel}) error${g.ms != null ? ` after ${g.ms} ms` : ""}: ${g.error}`];
    case "done": {
      const u = g.usage;
      const served = g.model !== g.requestedModel ? `, served by ${g.model}` : "";
      return [
        `${title} (${g.requestedModel}${served}) — latency ${g.ms} ms, tokens in/out ${u.input_tokens}/${u.output_tokens}, cache read ${u.cache_read_input_tokens}:`,
        JSON.stringify(g.grade, null, 2),
      ];
    }
  }
}

/** Plain-text dump of one prompt's comparison, for pasting elsewhere. */
export function formatPromptText(prompt: TestPrompt, session: PromptSession | undefined, opts: ConsensusOptions = {}): string {
  const out: string[] = [];
  out.push(`Prompt ${prompt.id} (${prompt.kind}): ${prompt.en}`);
  if (prompt.answerKey) {
    out.push(`Answer key (${prompt.answerKey.status}): ${prompt.answerKey.translit} | ${prompt.answerKey.arabic}`);
  }
  if (prompt.referenceTranslit) out.push(`Seed transliteration: ${prompt.referenceTranslit}`);
  if (prompt.tutorPartial) out.push(`Tutor partial: ${prompt.tutorPartial}`);
  if (!session) return [...out, "No recording."].join("\n");
  out.push(`Clip length: ${session.clip ? `${session.clip.seconds.toFixed(1)} s` : "no recording"}`);

  const status = consensusStatus(session.rows, opts);
  for (const row of session.rows) {
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
        if (status[row.id]) out.push(`Consensus: ${status[row.id]}`);
        out.push(...gradeLines(row.grade, "Grade (this transcript alone)"));
    }
  }

  session.consensus.forEach((run, i) => {
    out.push("", `=== Consensus grade ${i + 1} ===`);
    if (run.used.length) out.push(`Used: ${run.used.join(", ")}`);
    out.push(`Opt-in voters: ${run.optIn.length ? run.optIn.join(", ") : "none"}`);
    for (const d of run.discarded) out.push(`Discarded: ${d.label} — ${d.reason}`);
    for (const k of run.skipped) out.push(`Not counted: ${k.label} — ${k.reason}`);
    out.push(...gradeLines(run, "Grade"));
  });
  return out.join("\n");
}

/** Every prompt that has results, in prompt order. */
export function formatEverythingText(
  prompts: TestPrompt[],
  sessions: Record<string, PromptSession>,
  opts: ConsensusOptions = {},
  now: Date = new Date(),
): string {
  const withResults = prompts.filter((p) => hasResults(sessions[p.id]));
  const header = `Kalam STT comparison — ${now.toISOString()} — ${withResults.length} of ${prompts.length} prompts`;
  if (withResults.length === 0) return `${header}\nNo results yet.`;
  return [header, ...withResults.map((p) => formatPromptText(p, sessions[p.id], opts))].join(`\n\n${"#".repeat(40)}\n\n`);
}
