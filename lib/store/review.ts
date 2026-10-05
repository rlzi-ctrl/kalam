import { createHash } from "node:crypto";
import seed from "@/levantine_seed.json";
import { readBlob, writeBlob, deleteBlob, blobConfigured } from "@/lib/blob";
import { containsForm, preferredVariant, type Concept } from "@/lib/lexicon";
import { normalizeEnglish, sameArabic, type NativeRecording } from "@/lib/review/match";
import { allAnswerKeyOverrides, type KeyReview } from "./answerKeys";

// Native reviewer: checks every answer-key sentence and can record it. Recordings are MP3s in Blob.
const INDEX = "review-audio/index.json";
const audioPath = (id: string) => `review-audio/${id}.mp3`;
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

export const reviewStoreConfigured = blobConfigured;

type Sentence = { en: string; answer_key: { translit: string; arabic: string; status: string } };
const sentences = () => seed.practice_sentences as Sentence[];

/** Stable id for an answer-key sentence. */
export const sentenceId = (en: string) => createHash("sha256").update(en).digest("hex").slice(0, 12);

export function findSentence(id: string) {
  return sentences().find((s) => sentenceId(s.en) === id);
}

/** The practice sentence a Say it request is for, if the English matches one. */
export function findSentenceByEnglish(english: string) {
  const en = normalizeEnglish(english);
  return sentences().find((s) => normalizeEnglish(s.en) === en);
}

type AudioIndex = Record<string, NativeRecording & { bytes: number }>;

async function loadIndex(): Promise<AudioIndex> {
  const raw = await readBlob(INDEX, { fresh: true });
  return raw ? (JSON.parse(raw.toString("utf8")) as AudioIndex) : {};
}

export type ReviewItem = {
  id: string;
  en: string;
  translit: string;
  arabic: string;
  status: string;
  review?: KeyReview;
  /** Words that are the learner's deliberate choice (from their notes) though not plain Levantine. */
  learnerChoices: { translit: string; register: string; en: string }[];
  recording?: { recorded_at: string; bytes: number; matchesKey: boolean };
};

/** Every answer-key sentence with its current key, review state and recording. */
export async function listReviewItems(concepts: Concept[]): Promise<ReviewItem[]> {
  const [overrides, index] = await Promise.all([allAnswerKeyOverrides(), loadIndex().catch(() => ({}) as AudioIndex)]);
  return sentences().map((s) => {
    const id = sentenceId(s.en);
    const key = overrides[s.en] ?? s.answer_key;
    const rec = index[id];
    const learnerChoices = concepts
      .map((c) => ({ c, v: preferredVariant(c) }))
      .filter(({ v }) => v.register !== "levantine" && containsForm(key.translit, v.translit))
      .map(({ c, v }) => ({ translit: v.translit, register: v.register, en: c.en }));
    return {
      id,
      en: s.en,
      translit: key.translit,
      arabic: key.arabic,
      status: key.status,
      review: overrides[s.en]?.review,
      learnerChoices,
      recording: rec ? { recorded_at: rec.recorded_at, bytes: rec.bytes, matchesKey: sameArabic(rec.arabic, key.arabic) } : undefined,
    };
  });
}

/** Checks a body looks like MP3 (ID3 tag or an MPEG frame sync). */
export function looksLikeMp3(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf.subarray(0, 3).toString("latin1") === "ID3") return true;
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
}

export async function saveRecording(id: string, audio: Buffer, key: { en: string; translit: string; arabic: string }, now = new Date()) {
  if (audio.length > MAX_AUDIO_BYTES) throw new Error("recording too large");
  if (!looksLikeMp3(audio)) throw new Error("expected an MP3 recording");
  await writeBlob(audioPath(id), audio, "audio/mpeg");
  const index = await loadIndex();
  index[id] = { id, ...key, recorded_at: now.toISOString(), bytes: audio.length };
  await writeBlob(INDEX, JSON.stringify(index), "application/json");
  return index[id];
}

export async function deleteRecording(id: string) {
  await deleteBlob(audioPath(id));
  const index = await loadIndex();
  delete index[id];
  await writeBlob(INDEX, JSON.stringify(index), "application/json");
}

export const readRecording = (id: string) => readBlob(audioPath(id));

/** Recordings that still match their sentence's current key: these replace TTS in Say it. */
export async function currentRecordings(): Promise<NativeRecording[]> {
  if (!blobConfigured()) return [];
  const [overrides, index] = await Promise.all([allAnswerKeyOverrides(), loadIndex()]);
  return Object.values(index)
    .filter((r) => {
      const s = sentences().find((x) => x.en === r.en);
      const key = s ? (overrides[s.en] ?? s.answer_key) : undefined;
      return key && sameArabic(r.arabic, key.arabic);
    })
    .map(({ id, en, translit, arabic, recorded_at }) => ({ id, en, translit, arabic, recorded_at }));
}
