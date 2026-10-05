import { blobConfigured, readBlob, writeBlob } from "@/lib/blob";
import { applyOverrides, baseConcepts, emptyOverrides, type Concept, type LexiconOverrides } from "@/lib/lexicon";

const PATH = "lexicon/overrides.json";

export const lexiconStoreConfigured = blobConfigured;

export async function loadOverrides(): Promise<LexiconOverrides> {
  if (!blobConfigured()) return emptyOverrides();
  const raw = await readBlob(PATH, { fresh: true });
  return raw ? { ...emptyOverrides(), ...(JSON.parse(raw.toString("utf8")) as Partial<LexiconOverrides>) } : emptyOverrides();
}

export async function saveOverrides(o: LexiconOverrides): Promise<void> {
  await writeBlob(PATH, JSON.stringify(o), "application/json");
}

/** The lexicon with the learner's preferences applied. Falls back to defaults if storage fails. */
export async function loadLexicon(): Promise<Concept[]> {
  try {
    return applyOverrides(baseConcepts(), await loadOverrides());
  } catch (err) {
    console.error("[lexicon] could not load overrides, using defaults:", err);
    return baseConcepts();
  }
}
