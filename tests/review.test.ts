import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import seed from "@/levantine_seed.json";
import { requireLearnerOrReviewer, requireReviewer } from "@/lib/auth";
import { buildSystemPrompt } from "@/lib/grader/prompt";
import { levantine } from "@/lib/langpacks/levantine";
import { baseConcepts } from "@/lib/lexicon";
import { normalizeEnglish, recordingFor } from "@/lib/review/match";
import { buildSaySystemPrompt } from "@/lib/say/generate";
import { allAnswerKeyOverrides, saveReviewedKey } from "@/lib/store/answerKeys";
import { currentRecordings, findSentenceByEnglish, listReviewItems, saveRecording, sentenceId } from "@/lib/store/review";

const req = (headers: Record<string, string> = {}) => new Request("http://x/api", { headers });
// Smallest valid-looking MP3: an MPEG frame header followed by padding.
const MP3 = Buffer.concat([Buffer.from([0xff, 0xf3, 0x44, 0xc4]), Buffer.alloc(200)]);

describe("reviewer passcode", () => {
  afterEach(() => {
    delete process.env.REVIEWER_PASSCODE;
    delete process.env.APP_PASSCODE;
  });

  it("is switched off until REVIEWER_PASSCODE is set (never open by default)", () => {
    expect(requireReviewer(req())?.status).toBe(503);
  });

  it("accepts only the reviewer passcode, not the app passcode", () => {
    process.env.REVIEWER_PASSCODE = "olive";
    process.env.APP_PASSCODE = "sesame";
    expect(requireReviewer(req({ "x-reviewer-passcode": "nope" }))?.status).toBe(401);
    expect(requireReviewer(req({ "x-app-passcode": "sesame" }))?.status).toBe(401);
    expect(requireReviewer(req({ "x-reviewer-passcode": "olive" }))).toBeNull();
  });

  it("lets either the learner or the reviewer play recordings", () => {
    process.env.REVIEWER_PASSCODE = "olive";
    process.env.APP_PASSCODE = "sesame";
    expect(requireLearnerOrReviewer(req({ "x-reviewer-passcode": "olive" }))).toBeNull();
    expect(requireLearnerOrReviewer(req({ "x-app-passcode": "sesame" }))).toBeNull();
    expect(requireLearnerOrReviewer(req())?.status).toBe(401);
  });
});

describe("target dialect", () => {
  it("is urban Palestinian / Jordanian Levantine in the pack and the prompts", () => {
    expect(levantine.dialect).toBe("urban Palestinian / Jordanian Levantine");
    expect(buildSaySystemPrompt(baseConcepts())).toContain("urban Palestinian / Jordanian Levantine Arabic");
    expect(buildSystemPrompt(levantine, baseConcepts())).toContain("urban Palestinian / Jordanian Levantine Arabic");
  });
});

describe("review store", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kalam-review-"));
  beforeAll(() => {
    process.env.KALAM_LOCAL_BLOB_DIR = dir;
  });
  afterAll(() => {
    delete process.env.KALAM_LOCAL_BLOB_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  const weather = seed.practice_sentences.find((s) => s.en.startsWith("If the weather is hot tomorrow"))!;
  const id = sentenceId(weather.en);

  it("lists every answer-key sentence, flagging the learner's deliberate forms", async () => {
    const items = await listReviewItems(baseConcepts());
    expect(items).toHaveLength(seed.practice_sentences.length);
    const item = items.find((i) => i.id === id)!;
    expect(item).toMatchObject({ en: weather.en, translit: weather.answer_key.translit, status: "unverified" });
    expect(item.learnerChoices.map((c) => c.translit).sort()).toEqual(["asdiqaa", "ela", "etha"]);
  });

  it("marks a key verified when the reviewer edits it, keeping the previous text", async () => {
    const at = "2026-10-06T10:00:00.000Z";
    await saveReviewedKey(weather.en, { translit: "iza kan el-jaw 7arr bukra, rah nruh 3al ba7er ma3 asdiqa2na", arabic: "إذا كان الجو حر بكرا، رح نروح عالبحر مع أصدقائنا" }, {
      action: "edited", at, previous: { translit: weather.answer_key.translit, arabic: weather.answer_key.arabic },
    });
    const stored = (await allAnswerKeyOverrides())[weather.en];
    expect(stored).toMatchObject({ status: "verified", review: { action: "edited", at } });
    expect(stored.review?.previous?.arabic).toBe(weather.answer_key.arabic);
  });

  it("only offers recordings that still match the current key", async () => {
    await expect(saveRecording(id, Buffer.from("not audio at all"), { en: weather.en, translit: "x", arabic: "y" })).rejects.toThrow(/MP3/);
    const key = (await allAnswerKeyOverrides())[weather.en];
    await saveRecording(id, MP3, { en: weather.en, translit: key.translit, arabic: key.arabic });
    expect((await currentRecordings()).map((r) => r.id)).toEqual([id]);
    // The reviewer edits the sentence again: the old recording no longer counts.
    await saveReviewedKey(weather.en, { translit: "something else", arabic: "شي تاني" }, { action: "edited", at: new Date().toISOString() });
    expect(await currentRecordings()).toEqual([]);
    expect((await listReviewItems(baseConcepts())).find((i) => i.id === id)?.recording?.matchesKey).toBe(false);
  });
});

describe("matching Say it cards to recordings", () => {
  const rec = { id: "abc", en: "Why were you (m) late yesterday?", translit: "t", arabic: "ليش كنت متأخر أمس؟", recorded_at: "2026-10-06" };

  it("normalizes English", () => {
    expect(normalizeEnglish("  Why were you (m) late yesterday? ")).toBe("why were you m late yesterday");
    expect(findSentenceByEnglish("why were you (M) late yesterday? was there a problem with your car or the street")?.en).toMatch(/^Why were you/);
  });

  it("uses the recording only when the card has the reviewed Arabic", () => {
    expect(recordingFor({ english: "why were you (m) late yesterday", arabic: "ليش كنت متأخّر أمس" }, [rec])).toEqual({ recording: rec, outdated: false });
    expect(recordingFor({ english: "Why were you (m) late yesterday?", arabic: "ليش اتأخرت مبارح" }, [rec])).toEqual({ recording: undefined, outdated: true });
    expect(recordingFor({ english: "Something else", arabic: "ليش كنت متأخر أمس" }, [rec])).toEqual({ recording: undefined, outdated: false });
  });
});
