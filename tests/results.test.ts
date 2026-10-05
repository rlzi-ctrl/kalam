import { describe, expect, it } from "vitest";
import { consensusStatus, formatEverythingText, formatPromptText, type PromptSession, type Row } from "@/lib/results";
import { TEST_PROMPTS } from "@/lib/seed";

const grade = {
  meaning: 90, grammar: 80, vocabulary: 85, overall: 86, fluency_note: "ok", heard: "x",
  corrected_translit: "ana baheb haad", corrected_arabic: "أنا بحب هاد", errors: [], encouragement: "Nice",
  consensus_note: "All three agreed.",
  sound_errors: [],
};
const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 };

const rows: Row[] = [
  { id: "elevenlabs", label: "EL", inConsensus: true, result: { status: "done", text: "انا بحب هاد", ms: 812 }, grade: { status: "idle" } },
  { id: "openai-whisper-1", label: "W", inConsensus: true, result: { status: "done", text: "انا hada", ms: 500 }, grade: { status: "idle" } },
  { id: "openai-gpt-4o-transcribe", label: "G", inConsensus: true, result: { status: "error", error: "HTTP 500", ms: 30 }, grade: { status: "idle" } },
  { id: "azure-ar-JO", label: "Az", inConsensus: false, result: { status: "unconfigured", missing: ["AZURE_SPEECH_KEY"] }, grade: { status: "idle" } },
];

const session: PromptSession = {
  clip: { url: "blob:x", seconds: 2.34 },
  rows,
  consensus: [
    {
      key: "1", status: "done", requestedModel: "claude-opus-5-5", model: "claude-opus-5-5", grade, ms: 4100, usage, attempts: 1,
      used: ["elevenlabs"], discarded: [{ providerId: "openai-whisper-1", label: "W", reason: "contains Latin letters: h a d" }],
      skipped: [{ providerId: "openai-gpt-4o-transcribe", label: "G", reason: "opt-in, switched off" }], optIn: [],
    },
    { key: "2", status: "error", requestedModel: "claude-sonnet-5-5", error: "boom", used: [], discarded: [], skipped: [], optIn: ["openai-gpt-4o-transcribe"] },
  ],
};

describe("consensusStatus", () => {
  it("labels each column", () => {
    expect(consensusStatus(rows)).toEqual({
      elevenlabs: "used in consensus",
      "openai-whisper-1": "discarded: contains Latin letters: h a d",
      "azure-ar-JO": "not in consensus",
    });
  });
});

describe("formatPromptText", () => {
  it("lists target, transcripts with latency and consensus status, and every grade run", () => {
    const text = formatPromptText(TEST_PROMPTS[0], session);
    expect(text).toContain("Prompt p1 (phrase): I like this");
    expect(text).toContain("Clip length: 2.3 s");
    expect(text).toContain("Latency: 812 ms");
    expect(text).toContain("Consensus: discarded: contains Latin letters: h a d");
    expect(text).toContain("STT error after 30 ms: HTTP 500");
    expect(text).toContain("not configured (missing AZURE_SPEECH_KEY)");
    expect(text).toContain(
      "=== Consensus grade 1 ===\nUsed: elevenlabs\nOpt-in voters: none\nDiscarded: W — contains Latin letters: h a d\nNot counted: G — opt-in, switched off",
    );
    expect(text).toContain("=== Consensus grade 2 ===\nOpt-in voters: openai-gpt-4o-transcribe");
    expect(text).toContain("Grade (claude-opus-5-5) — latency 4100 ms");
    expect(text).toContain('"consensus_note": "All three agreed."');
    expect(text).toContain("Grade (claude-sonnet-5-5) error: boom");
  });

  it("includes the answer key for sentences", () => {
    expect(formatPromptText(TEST_PROMPTS[8], undefined)).toMatch(/Answer key \(unverified\): sayyarit-hom .* \| سيارتهم/);
  });
});

describe("formatEverythingText", () => {
  it("includes only prompts with results", () => {
    const text = formatEverythingText(TEST_PROMPTS, { p1: session, s2: session }, {}, new Date("2026-10-02T00:00:00Z"));
    expect(text).toContain("2 of 15 prompts");
    expect(text).toContain("Prompt p1 (phrase)");
    expect(text).toContain("Prompt s2 (sentence)");
    expect(text).not.toContain("Prompt p2 ");
  });

  it("says so when nothing has been recorded", () => {
    expect(formatEverythingText(TEST_PROMPTS, {})).toMatch(/No results yet\.$/);
  });
});
