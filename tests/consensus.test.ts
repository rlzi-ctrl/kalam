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

const t = (providerId: string, text: string) => ({ providerId, label: providerId, text });
const ids = (xs: { providerId: string }[]) => xs.map((x) => x.providerId);

describe("selectForConsensus", () => {
  it("keeps clean core transcripts and discards ones with foreign letters", () => {
    const { used, discarded } = selectForConsensus([
      t("elevenlabs", "انا بحب هاد"),
      t("openai-whisper-1", "من یحب هاد"),
      t("some-other-provider", "انا بحب هاد"),
    ]);
    expect(ids(used)).toEqual(["elevenlabs"]);
    expect(discarded).toEqual([{ providerId: "openai-whisper-1", label: "openai-whisper-1", reason: "contains non-Arabic letters: ی" }]);
  });

  it("leaves gpt-4o-transcribe out unless opted in", () => {
    const transcripts = [t("elevenlabs", "انا بحب هاد"), t("openai-gpt-4o-transcribe", "انا بحب هاد")];
    const off = selectForConsensus(transcripts);
    expect(ids(off.used)).toEqual(["elevenlabs"]);
    expect(off.skipped).toEqual([{ providerId: "openai-gpt-4o-transcribe", label: "openai-gpt-4o-transcribe", reason: "opt-in, switched off" }]);
    const on = selectForConsensus(transcripts, { optIn: ["openai-gpt-4o-transcribe"] });
    expect(ids(on.used)).toEqual(["elevenlabs", "openai-gpt-4o-transcribe"]);
    expect(on.skipped).toEqual([]);
  });

  it("filters an opted-in gpt-4o transcript like any other", () => {
    const { used, discarded } = selectForConsensus([t("openai-gpt-4o-transcribe", "I like this")], { optIn: ["openai-gpt-4o-transcribe"] });
    expect(used).toEqual([]);
    expect(ids(discarded)).toEqual(["openai-gpt-4o-transcribe"]);
  });
});

describe("Azure counts as one vote", () => {
  const vote = (transcripts: ReturnType<typeof t>[]) => {
    const { used, skipped, discarded } = selectForConsensus(transcripts);
    const azure = used.filter((u) => u.providerId.startsWith("azure-"));
    expect(azure).toHaveLength(Math.min(1, transcripts.length - discarded.length));
    return { azure: azure[0], skipped, discarded, used };
  };

  it("uses the majority reading, ignoring spelling variants", () => {
    const { azure, skipped } = vote([
      t("azure-ar-JO", "انا بحب هاد"),
      t("azure-ar-LB", "أنا بحبّ هاد."),
      t("azure-ar-SY", "انا بحب هذا"),
    ]);
    expect(azure.providerId).toBe("azure-ar-JO");
    expect(azure.label).toBe("azure-ar-JO — the Azure vote (2 of 3 Azure locales agreed, using ar-JO)");
    expect(skipped.map((s) => s.reason)).toEqual([
      "Azure counts as one vote: 2 of 3 Azure locales agreed, using ar-JO",
      "Azure counts as one vote: 2 of 3 Azure locales agreed, using ar-JO",
    ]);
  });

  it("follows the majority even when ar-JO is the odd one out", () => {
    const { azure } = vote([
      t("azure-ar-JO", "انا بحب هذا"),
      t("azure-ar-LB", "انا بحب هاد"),
      t("azure-ar-SY", "انا بحب هاد"),
    ]);
    expect(azure.providerId).toBe("azure-ar-LB");
    expect(azure.text).toBe("انا بحب هاد");
  });

  it("falls back to ar-JO when all three disagree", () => {
    const { azure } = vote([t("azure-ar-LB", "انا"), t("azure-ar-JO", "انا بحب"), t("azure-ar-SY", "انا بحب هاد")]);
    expect(azure.providerId).toBe("azure-ar-JO");
    expect(azure.label).toContain("Azure locales disagreed, using ar-JO");
  });

  it("drops English Azure output before voting", () => {
    const { azure, discarded } = vote([
      t("azure-ar-JO", "I'm not a hemispod."),
      t("azure-ar-LB", "انا بحب هاد"),
      t("azure-ar-SY", "انا بحب هاد"),
    ]);
    expect(ids(discarded)).toEqual(["azure-ar-JO"]);
    expect(azure.providerId).toBe("azure-ar-LB");
  });

  it("uses the first usable locale if ar-JO is unusable and the rest disagree", () => {
    const { azure } = vote([t("azure-ar-JO", "hello"), t("azure-ar-LB", "انا"), t("azure-ar-SY", "انا بحب")]);
    expect(azure.providerId).toBe("azure-ar-LB");
    expect(azure.label).toContain("ar-JO was unusable");
  });

  it("gives Azure exactly one vote next to the core voters", () => {
    const { used } = vote([
      t("elevenlabs", "انا بحب هاد"),
      t("openai-whisper-1", "انا بحب هاد"),
      t("azure-ar-JO", "انا بحب هاد"),
      t("azure-ar-LB", "انا بحب هاد"),
      t("azure-ar-SY", "انا بحب هاد"),
    ]);
    expect(ids(used)).toEqual(["elevenlabs", "openai-whisper-1", "azure-ar-JO"]);
  });
});

describe("majorityOf", () => {
  it("needs more than half", () => {
    expect([1, 2, 3].map(majorityOf)).toEqual([1, 2, 2]);
  });
});
