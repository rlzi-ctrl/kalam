import { describe, expect, it } from "vitest";
import { formatResultsText, type Row } from "@/lib/results";
import { TEST_PROMPTS } from "@/lib/seed";

describe("formatResultsText", () => {
  it("lists target, each provider's transcript/latency and grade JSON", () => {
    const rows: Row[] = [
      { id: "a", label: "Provider A", result: { status: "unconfigured", missing: ["A_KEY"] }, grade: { status: "idle" } },
      {
        id: "b",
        label: "Provider B",
        result: { status: "done", text: "انا بحب هاد", ms: 812 },
        grade: {
          status: "done",
          model: "claude-opus-5-5",
          ms: 4100,
          attempts: 1,
          usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 },
          grade: {
            meaning: 90, grammar: 80, vocabulary: 85, overall: 86, fluency_note: "ok", heard: "انا بحب هاد",
            corrected_translit: "ana baheb haad", corrected_arabic: "أنا بحب هاد", errors: [], encouragement: "Nice",
          },
        },
      },
      { id: "c", label: "Provider C", result: { status: "error", error: "HTTP 500", ms: 30 }, grade: { status: "idle" } },
    ];
    const text = formatResultsText(TEST_PROMPTS[0], rows, 2.34, new Date("2026-10-02T00:00:00Z"));
    expect(text).toContain("Prompt p1 (phrase): I like this");
    expect(text).toContain("Seed transliteration: ana baheb haad");
    expect(text).toContain("Clip length: 2.3 s");
    expect(text).toContain("not configured (missing A_KEY)");
    expect(text).toContain("Latency: 812 ms");
    expect(text).toContain("Transcript: انا بحب هاد");
    expect(text).toContain('"corrected_translit": "ana baheb haad"');
    expect(text).toContain("STT error after 30 ms: HTTP 500");
  });
});
