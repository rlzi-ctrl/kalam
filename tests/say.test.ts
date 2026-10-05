import { describe, expect, it } from "vitest";
import { baseConcepts } from "@/lib/lexicon";
import { buildSaySystemPrompt, checkSayOutput, cleanSayOutput } from "@/lib/say/generate";

const good = {
  translit: "sayyarit-hom adeemea", arabic: "سيارتهم قديمة", tts_spelling: "سيّارِتهُم أديمة", notes: "",
  words: [
    { en: "their car", translit: "sayyarit-hom", arabic: "سيارتهم", tts_spelling: "سيّارِتهُم", known: false, concept_id: "", other_forms: [] },
    { en: "old", translit: "adeemea", arabic: "قديمة", tts_spelling: "أديمة", known: true, concept_id: "l12-old", other_forms: [] },
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
    const system = buildSaySystemPrompt(baseConcepts());
    expect(system).toContain("tts_spelling");
    expect(system).toContain("[p-friends] Friends = asdiqaa (أصدقاء)");
    expect(system).toContain("[l12-old] Old = adeem (قديم)");
    expect(system).toContain("أديمة");
    expect(system).toContain("translit: ashan kont mashghol ams");
  });
});

describe("cleanSayOutput", () => {
  it("drops invented concept ids and unusable or duplicate other forms", () => {
    const out = cleanSayOutput(
      {
        ...good,
        words: [
          { ...good.words[0], concept_id: "made-up", other_forms: [{ translit: "sayyart-hom", arabic: "سیارتهم", register: "levantine" }] },
          {
            ...good.words[1],
            other_forms: [
              { translit: "adeemea", arabic: "قديمة", register: "levantine" },
              { translit: "2adeeme", arabic: "قديمة", register: "regional" },
              { translit: "a", arabic: "ا", register: "msa" },
              { translit: "b", arabic: "ب", register: "msa" },
            ],
          },
        ],
      },
      baseConcepts(),
    );
    expect(out.words[0]).toMatchObject({ concept_id: "", other_forms: [] });
    expect(out.words[1].concept_id).toBe("l12-old");
    expect(out.words[1].other_forms.map((f) => f.translit)).toEqual(["2adeeme", "a"]);
  });
});
