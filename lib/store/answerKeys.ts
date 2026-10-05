import { blobConfigured, readBlob, writeBlob } from "@/lib/blob";
import { findPrompt, type AnswerKey, type TestPrompt } from "@/lib/seed";

// Rewrites of seed answer keys (approved preference rewrites, reviewer checks and edits), keyed by the
// sentence's English. The seed file itself is untouched.
const PATH = "answer-keys/overrides.json";

export type KeyReview = {
  action: "correct" | "edited";
  at: string;
  note?: string;
  /** The key before the reviewer edited it. */
  previous?: { translit: string; arabic: string };
};

export type StoredKey = AnswerKey & { updated_at: string; review?: KeyReview };
type Overrides = Record<string, StoredKey>;

async function load(): Promise<Overrides> {
  if (!blobConfigured()) return {};
  const raw = await readBlob(PATH, { fresh: true });
  return raw ? (JSON.parse(raw.toString("utf8")) as Overrides) : {};
}

/** A learner-approved rewrite (e.g. new preferred forms): unverified until the reviewer checks it. */
export async function saveAnswerKey(en: string, key: { translit: string; arabic: string }): Promise<void> {
  const all = await load();
  all[en] = { ...key, status: "unverified", updated_at: new Date().toISOString() };
  await writeBlob(PATH, JSON.stringify(all), "application/json");
}

/** The reviewer marked the key correct, or edited it: either way it is now verified. */
export async function saveReviewedKey(en: string, key: { translit: string; arabic: string }, review: KeyReview): Promise<StoredKey> {
  const all = await load();
  const stored: StoredKey = { ...key, status: "verified", updated_at: review.at, review };
  all[en] = stored;
  await writeBlob(PATH, JSON.stringify(all), "application/json");
  return stored;
}

/** findPrompt with any stored answer-key rewrite applied. */
export async function findPromptWithKey(id: string): Promise<TestPrompt | undefined> {
  const prompt = findPrompt(id);
  if (!prompt?.answerKey) return prompt;
  try {
    const override = (await load())[prompt.en];
    return override ? { ...prompt, answerKey: { translit: override.translit, arabic: override.arabic, status: override.status } } : prompt;
  } catch (err) {
    console.error("[answer-keys] could not load overrides:", err);
    return prompt;
  }
}

export async function allAnswerKeyOverrides(): Promise<Overrides> {
  try {
    return await load();
  } catch {
    return {};
  }
}
