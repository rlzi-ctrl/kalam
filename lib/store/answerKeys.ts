import { blobConfigured, readBlob, writeBlob } from "@/lib/blob";
import { findPrompt, type AnswerKey, type TestPrompt } from "@/lib/seed";

// Approved rewrites of seed answer keys, keyed by the sentence's English. The seed file itself is untouched.
const PATH = "answer-keys/overrides.json";

type Overrides = Record<string, AnswerKey & { updated_at: string }>;

async function load(): Promise<Overrides> {
  if (!blobConfigured()) return {};
  const raw = await readBlob(PATH, { fresh: true });
  return raw ? (JSON.parse(raw.toString("utf8")) as Overrides) : {};
}

export async function saveAnswerKey(en: string, key: { translit: string; arabic: string }): Promise<void> {
  const all = await load();
  all[en] = { ...key, status: "unverified", updated_at: new Date().toISOString() };
  await writeBlob(PATH, JSON.stringify(all), "application/json");
}

/** findPrompt with any approved answer-key rewrite applied. */
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
