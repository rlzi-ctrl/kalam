import { describe, expect, it } from "vitest";
import lexicon from "@/levantine_lexicon.json";
import seed from "@/levantine_seed.json";
import { alsoHeard } from "@/components/WordBreakdown";
import { levantine } from "@/lib/langpacks/levantine";
import {
  applyOverrides,
  baseConcepts,
  containsForm,
  emptyOverrides,
  findNonPreferred,
  preferredVariant,
  variantsPromptBlock,
} from "@/lib/lexicon";

const concepts = baseConcepts();
const byId = (cs: typeof concepts, id: string) => cs.find((c) => c.id === id)!;

describe("levantine_lexicon.json", () => {
  it("has one concept per vocab item and phrase, each with exactly one preferred form", () => {
    const vocab = seed.vocab_by_lesson.flatMap((l) => l.items as { translit?: string | null }[]).filter((i) => i.translit);
    expect(concepts).toHaveLength(vocab.length + seed.phrases.length);
    for (const c of concepts) expect(c.variants.filter((v) => v.preferred)).toHaveLength(1);
  });

  it("prefers the notes form, except where a review flag says it's a different word or a misspelling", () => {
    const pref = (id: string) => preferredVariant(byId(concepts, id));
    expect(pref("p-friends")).toMatchObject({ translit: "asdiqaa", source: "notes", register: "msa" });
    expect(pref("l1-to")).toMatchObject({ translit: "ela", source: "notes" });
    expect(pref("l5-cheap").translit).toBe("erkhes");
    expect(pref("l12-old")).toMatchObject({ translit: "adeem", source: "generated" });
    expect(pref("l12-until-even").translit).toBe("hatta");
    expect(pref("l16-word").translit).toBe("kilme");
    expect(byId(concepts, "l12-old").review_flag).toMatch(/older/);
  });

  it("stores Arabic-only spellings", () => {
    for (const c of concepts) for (const v of c.variants) {
      expect(levantine.transcriptProblem(v.arabic.replace(/ـ/g, "")), `${v.id} ${v.arabic}`).toBeNull();
      if (v.tts) expect(levantine.transcriptProblem(v.tts), v.id).toBeNull();
    }
  });

  it("marks every non-notes form as generated (for the reviewer to check)", () => {
    expect(lexicon.concepts.flatMap((c) => c.variants).every((v) => v.source === "notes" || v.source === "generated")).toBe(true);
  });
});

describe("containsForm", () => {
  it.each([
    ["rah nroh ela el-bahar ma3 asdiqa2na", "asdiqaa", true],
    ["bedna shaqa rkheesa", "rkhees", true],
    ["hal-qamees el-rkhees", "rkhees", true],
    ["ra2yoh ghalat", "ghalat", true],
    ["ana ma ba3ref", "ana ma ba3ref", true],
    ["ana bafaker", "ana ma ba3ref", false],
    ["el-shamsiye", "shams", false], // "-iye" is not a suffix, so this is a different word
    ["3al bahar", "3a", false], // too short to check reliably
  ])("%s contains %s → %s", (text, form, expected) => {
    expect(containsForm(text, form)).toBe(expected);
  });
});

describe("answer keys use the preferred forms", () => {
  it("with the default preferences, no practice-sentence key uses a non-preferred form", () => {
    const stale = seed.practice_sentences.flatMap((s) =>
      findNonPreferred(s.answer_key.translit, concepts).map((u) => `${s.en} → ${u.used.translit}`),
    );
    expect(stale).toEqual([]);
  });

  it("flags a key once the learner prefers another form", () => {
    const friends = byId(concepts, "p-friends");
    const ashab = friends.variants.find((v) => v.translit === "ashab")!;
    const prefs = applyOverrides(concepts, { ...emptyOverrides(), preferred: { [friends.id]: ashab.id } });
    const key = seed.practice_sentences.find((s) => s.en.startsWith("If the weather is hot tomorrow"))!.answer_key.translit;
    expect(findNonPreferred(key, prefs).map((u) => [u.used.translit, u.preferred.translit])).toEqual([["asdiqaa", "ashab"]]);
  });
});

describe("applyOverrides", () => {
  it("switches the preferred form, adds variants and new concepts", () => {
    const out = applyOverrides(concepts, {
      preferred: { "l1-to": "l1-to:3a", "u-car": "u-car:sayyara" },
      added: { "l1-to": [{ id: "l1-to:3al", form: "3al", translit: "3al", arabic: "عال", register: "levantine", source: "reviewer", preferred: false }] },
      concepts: {
        "u-car": {
          id: "u-car", en: "car", lesson: null,
          variants: [{ id: "u-car:sayyara", form: "sayyara", translit: "sayyara", arabic: "سيارة", register: "levantine", source: "generated", preferred: false }],
        },
      },
    });
    const to = byId(out, "l1-to");
    expect(preferredVariant(to).translit).toBe("3a");
    expect(to.variants.map((v) => v.translit)).toEqual(["ela", "3a", "la", "3al"]);
    expect(preferredVariant(byId(out, "u-car")).translit).toBe("sayyara");
    // The base lexicon is untouched.
    expect(preferredVariant(byId(concepts, "l1-to")).translit).toBe("ela");
  });

  it("ignores a preference for a variant that doesn't exist", () => {
    const out = applyOverrides(concepts, { ...emptyOverrides(), preferred: { "l1-to": "l1-to:nope" } });
    expect(preferredVariant(byId(out, "l1-to")).translit).toBe("ela");
  });
});

describe("variantsPromptBlock", () => {
  it("lists only concepts with more than one form", () => {
    const block = variantsPromptBlock(concepts);
    expect(block.split("\n")).toHaveLength(concepts.filter((c) => c.variants.length > 1).length);
    expect(block).toContain("l1-to | To: preferred ela (إلى); also accepted: 3a (ع, levantine); la (لـ, levantine)");
  });
});

describe("alsoHeard (you'll also hear)", () => {
  const word = (translit: string, concept_id: string, other_forms: { translit: string; arabic: string; register: "levantine" | "msa" | "regional" }[] = []) => ({
    en: "friends", translit, arabic: "أصدقائنا", tts_spelling: "أصدقائنا", known: true, concept_id, other_forms,
  });

  it("offers the concept's other forms and new suggestions, not the form used", () => {
    const forms = alsoHeard(word("asdiqa2na", "p-friends", [{ translit: "ashabna", arabic: "أصحابنا", register: "levantine" }, { translit: "rfa2na", arabic: "رفقاتنا", register: "regional" }]), byId(concepts, "p-friends"));
    // ashabna is already covered by the lexicon's "ashab"; rfa2na is new.
    expect(forms.map((f) => [f.translit, f.origin])).toEqual([["ashab", "lexicon"], ["rfa2na", "suggested"]]);
  });

  it("skips lexicon forms when the word doesn't use any of them (an inflected verb)", () => {
    const talk = { ...word("bahki", "l3-i-say-talk"), en: "talk", arabic: "بحكي" };
    expect(alsoHeard(talk, byId(concepts, "l3-i-say-talk"))).toEqual([]);
  });

  it("works for words without a concept", () => {
    expect(alsoHeard(word("sayyara", "", [{ translit: "3arabiyye", arabic: "عربية", register: "regional" }]), undefined).map((f) => f.translit)).toEqual(["3arabiyye"]);
  });
});
