import { blobConfigured, readBlob, writeBlob } from "@/lib/blob";
import type { MinimalPair } from "@/lib/pairs/schema";

const PATH = "pairs/all.json";

export const pairStoreConfigured = blobConfigured;

export async function listPairs(): Promise<MinimalPair[]> {
  const raw = await readBlob(PATH, { fresh: true });
  return raw ? (JSON.parse(raw.toString("utf8")) as MinimalPair[]) : [];
}

export async function savePairs(pairs: MinimalPair[]): Promise<void> {
  await writeBlob(PATH, JSON.stringify(pairs), "application/json");
}
