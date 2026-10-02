import { describe, expect, it } from "vitest";
import { majorityOf, selectForConsensus } from "@/lib/consensus";
import { levantine } from "@/lib/langpacks/levantine";

const problem = levantine.transcriptProblem;

describe("transcript filter", () => {
  it("accepts plain Arabic, with diacritics, tatweel, digits and punctuation", () => {
    expect(problem("انا بحب هاد")).toBeNull();
    expect(problem("أنا بَحِبّ هـاد، 3 مرات؟ ٣")).toBeNull();
    expect(problem("إحنا رح نروح عالبحر.")).toBeNull();
  });

  it.each([
    ["ک", "Persian kaf"],
    ["ی", "Persian yeh"],
    ["ے", "Urdu yeh barree"],
    ["ھ", "heh doachashmee"],
    ["پ", "peh"],
    ["گ", "gaf"],
  ])("rejects %s (%s)", (letter) => {
    expect(problem(`انا ${letter}حب هاد`)).toMatch(/non-Arabic letters/);
  });

  it("rejects Latin text and says so", () => {
    expect(problem("انا بحب hada")).toBe("contains Latin letters: h a d");
    expect(problem("ana baheb haad")).toMatch(/^contains Latin letters/);
    expect(problem("انا ک hello")).toMatch(/^contains Latin and non-Arabic letters/);
  });

  it("rejects empty transcripts", () => {
    expect(problem("  ")).toBe("empty transcript");
  });
});

describe("selectForConsensus", () => {
  it("keeps clean consensus transcripts, discards bad ones, ignores other providers", () => {
    const { used, discarded } = selectForConsensus([
      { providerId: "elevenlabs", label: "EL", text: "انا بحب هاد" },
      { providerId: "openai-whisper-1", label: "W", text: "من یحب هاد" },
      { providerId: "openai-gpt-4o-transcribe", label: "G", text: "انا بحب هذا" },
      { providerId: "azure-ar-JO", label: "Az", text: "انا بحب هاد" },
    ]);
    expect(used.map((t) => t.providerId)).toEqual(["elevenlabs", "openai-gpt-4o-transcribe"]);
    expect(discarded).toEqual([{ providerId: "openai-whisper-1", label: "W", reason: "contains non-Arabic letters: ی" }]);
  });
});

describe("majorityOf", () => {
  it("needs more than half", () => {
    expect([1, 2, 3].map(majorityOf)).toEqual([1, 2, 2]);
  });
});
