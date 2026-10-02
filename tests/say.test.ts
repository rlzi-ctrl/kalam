import { describe, expect, it } from "vitest";
import { buildSaySystemPrompt, checkSayOutput } from "@/lib/say/generate";

const good = {
  translit: "sayyarit-hom adeemea", arabic: "سيارتهم قديمة", tts_spelling: "سيّارِتهُم أديمة", notes: "",
  words: [
    { en: "their car", translit: "sayyarit-hom", arabic: "سيارتهم", tts_spelling: "سيّارِتهُم", known: false },
    { en: "old", translit: "adeemea", arabic: "قديمة", tts_spelling: "أديمة", known: true },
  ],
};

describe("Say it output check", () => {
  it("accepts Arabic-only Arabic fields (with vowel marks)", () => {
    expect(checkSayOutput(good)).toBeNull();
  });

  it("rejects Latin or Persian letters in Arabic fields", () => {
    expect(checkSayOutput({ ...good, tts_spelling: "أديمة adeema" })).toMatch(/^tts_spelling contains Latin letters/);
    const words = [good.words[0], { ...good.words[1], arabic: "قدیمة" }];
    expect(checkSayOutput({ ...good, words })).toMatch(/^words\[1\]\.arabic contains non-Arabic letters/);
  });
});

describe("Say it system prompt", () => {
  it("carries the rules, the vocab list and answer-key style examples", () => {
    const system = buildSaySystemPrompt();
    expect(system).toContain("tts_spelling");
    expect(system).toContain("أديمة");
    expect(system).toContain("L1: ");
    expect(system).toContain("translit: ashan kont mashghol ams");
  });
});
