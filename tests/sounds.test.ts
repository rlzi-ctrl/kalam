import { describe, expect, it } from "vitest";
import { SOUNDS, soundById, soundOfLetter, soundRulesPromptBlock } from "@/lib/langpacks/sounds";
import { baseConcepts } from "@/lib/lexicon";
import { soundExamples } from "@/lib/lexicon/sounds";
import { summarizeWeakSounds } from "@/lib/store/soundStats";

describe("sounds", () => {
  it("covers the eight sounds asked for", () => {
    expect(SOUNDS.map((s) => s.symbol)).toEqual(["2", "3", "7", "5 / kh", "gh", "6", "9", "q → 2"]);
  });

  it("maps letters to sounds", () => {
    expect([..."حخعغطصقأ"].map(soundOfLetter)).toEqual(["haa", "khaa", "ain", "ghain", "taa", "saad", "qaf", "hamza"]);
    expect(soundOfLetter("ه")).toBeUndefined();
  });

  it("tells the grader the swaps, but never to report hamza, and only k for qaf", () => {
    const rules = soundRulesPromptBlock();
    expect(rules).toContain("- haa: expected ح (7), a swap is heard as ه");
    expect(rules).not.toContain("- hamza:");
    expect(rules).toContain("For qaf, ء/أ, ق or g are all correct Levantine; report only ك.");
  });

  it("pulls example words from the vocab, single words first", () => {
    const haa = soundExamples(soundById("haa")!, baseConcepts());
    expect(haa.length).toBe(6);
    expect(haa.every((e) => e.arabic.includes("ح"))).toBe(true);
    expect(haa[0].arabic.includes(" ")).toBe(false);
    expect(new Set(haa.map((e) => e.arabic)).size).toBe(haa.length);
  });

  it("speaks qaf examples with a glottal stop", () => {
    const qaf = soundExamples(soundById("qaf")!, baseConcepts());
    expect(qaf.length).toBeGreaterThan(0);
    for (const e of qaf) expect(e.tts.includes("ق")).toBe(false);
  });
});

describe("summarizeWeakSounds", () => {
  it("ranks by recent errors, then all-time, with examples", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const ev = (sound: "haa" | "ain" | "taa", daysAgo: number, word = "حلو", heard = "هلو") => ({
      at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), sound, word, heard, source: "p1",
    });
    const weak = summarizeWeakSounds({ attempts: 9, events: [ev("ain", 30), ev("ain", 31), ev("ain", 32), ev("haa", 1), ev("haa", 2, "حار", "هار"), ev("taa", 3)] }, now);
    expect(weak.map((w) => [w.sound, w.recent, w.total])).toEqual([["haa", 2, 2], ["taa", 1, 1], ["ain", 0, 3]]);
    expect(weak[0].examples).toEqual([{ word: "حار", heard: "هار" }, { word: "حلو", heard: "هلو" }]);
  });
});
