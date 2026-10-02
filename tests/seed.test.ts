import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserMessage } from "@/lib/grader/prompt";
import { levantine } from "@/lib/langpacks/levantine";
import { TEST_PROMPTS } from "@/lib/seed";

describe("test prompts", () => {
  it("has 8 phrases and 7 sentences with unique ids", () => {
    expect(TEST_PROMPTS.filter((p) => p.kind === "phrase")).toHaveLength(8);
    expect(TEST_PROMPTS.filter((p) => p.kind === "sentence")).toHaveLength(7);
    expect(new Set(TEST_PROMPTS.map((p) => p.id)).size).toBe(15);
  });

  it("carries seed answers and tutor partials", () => {
    expect(TEST_PROMPTS[0]).toMatchObject({ en: "I like this", referenceTranslit: "ana baheb haad" });
    expect(TEST_PROMPTS.filter((p) => p.tutorPartial)).toHaveLength(4);
  });
});

describe("grader prompt", () => {
  it("includes vocab, grammar and review flags in the system prompt", () => {
    const system = buildSystemPrompt(levantine);
    expect(system).toContain("L1: ");
    expect(system).toContain("present_tense_prefixes_from_notes");
    expect(system).toContain("bisse");
  });

  it("includes the reference answer only when the seed has one", () => {
    const phrase = buildUserMessage(TEST_PROMPTS[0], "ana bheb hada", "X");
    expect(phrase).toContain("<reference_translit");
    const sentence = buildUserMessage(TEST_PROMPTS[8], "sayyarit-hom", "X");
    expect(sentence).not.toContain("<reference_translit");
    expect(sentence).toContain("<tutor_partial_answer>sayyarit hom</tutor_partial_answer>");
  });
});
