import { describe, expect, it } from "vitest";
import seed from "@/levantine_seed.json";
import { buildSystemPrompt, buildUserMessage } from "@/lib/grader/prompt";
import { levantine } from "@/lib/langpacks/levantine";
import { TEST_PROMPTS } from "@/lib/seed";

const t = (providerId: string, text: string) => ({ providerId, label: providerId, text });

describe("test prompts", () => {
  it("has 8 phrases and 7 sentences with unique ids", () => {
    expect(TEST_PROMPTS.filter((p) => p.kind === "phrase")).toHaveLength(8);
    expect(TEST_PROMPTS.filter((p) => p.kind === "sentence")).toHaveLength(7);
    expect(new Set(TEST_PROMPTS.map((p) => p.id)).size).toBe(15);
  });

  it("carries seed answers, tutor partials and answer keys", () => {
    expect(TEST_PROMPTS[0]).toMatchObject({ en: "I like this", referenceTranslit: "ana baheb haad" });
    expect(TEST_PROMPTS.filter((p) => p.tutorPartial)).toHaveLength(4);
    expect(TEST_PROMPTS.filter((p) => p.kind === "sentence").every((p) => p.answerKey?.status === "unverified")).toBe(true);
  });
});

describe("answer key in the seed", () => {
  it("has one unverified translit + Arabic answer for every practice sentence", () => {
    for (const s of seed.practice_sentences) {
      expect(s.answer_key.status).toBe("unverified");
      expect(s.answer_key.translit).toMatch(/^[a-z0-9 ,.?:'-]+$/);
      expect(levantine.transcriptProblem(s.answer_key.arabic)).toBeNull();
    }
  });
});

describe("grader prompt", () => {
  it("includes vocab, grammar, review flags and the marking rules in the system prompt", () => {
    const system = buildSystemPrompt(levantine);
    expect(system).toContain("L1: ");
    expect(system).toContain("present_tense_prefixes_from_notes");
    expect(system).toContain("bisse");
    expect(system).toContain("errors_need_agreement_of");
    expect(system).toContain('"Key check:"');
  });

  it("passes the answer key and the majority threshold for consensus", () => {
    const sentence = TEST_PROMPTS[8];
    const msg = buildUserMessage(sentence, [t("a", "x"), t("b", "y"), t("c", "z")]);
    expect(msg).toContain(`<answer_key status="unverified">\ntranslit: ${sentence.answerKey!.translit}`);
    expect(msg).toContain('<transcripts count="3" errors_need_agreement_of="2">');
    expect(msg).toContain('<transcript source="b">y</transcript>');
    expect(msg).toContain("<tutor_partial_answer>sayyarit hom</tutor_partial_answer>");
  });

  it("uses the phrase reference when there is no answer key", () => {
    const msg = buildUserMessage(TEST_PROMPTS[0], [t("a", "انا بحب هاد")]);
    expect(msg).toContain("<reference_translit");
    expect(msg).not.toContain("<answer_key");
    expect(msg).toContain('errors_need_agreement_of="1"');
  });
});
