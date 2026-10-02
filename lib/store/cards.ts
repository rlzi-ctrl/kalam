import { blobConfigured, deleteBlob, listBlobPaths, readBlob, writeBlob } from "@/lib/blob";
import type { Card } from "@/lib/cards";

// One private JSON blob per card. Behind these functions so Phase 1 can swap in Postgres.
const PREFIX = "cards/";
const ID = /^[0-9a-f-]{36}$/;
const pathFor = (id: string) => `${PREFIX}${id}.json`;

export const cardStoreConfigured = blobConfigured;

export async function saveCard(card: Card): Promise<void> {
  await writeBlob(pathFor(card.id), JSON.stringify(card), "application/json");
}

export async function getCard(id: string): Promise<Card | null> {
  if (!ID.test(id)) return null;
  const raw = await readBlob(pathFor(id), { fresh: true });
  return raw ? (JSON.parse(raw.toString("utf8")) as Card) : null;
}

/** Oldest first. */
export async function listCards(): Promise<Card[]> {
  const paths = await listBlobPaths(PREFIX);
  const cards = await Promise.all(
    paths.map(async (p) => {
      const raw = await readBlob(p, { fresh: true });
      return raw ? (JSON.parse(raw.toString("utf8")) as Card) : null;
    }),
  );
  return cards.filter((c): c is Card => c !== null).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function deleteCard(id: string): Promise<void> {
  if (ID.test(id)) await deleteBlob(pathFor(id));
}
