import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, Buffer>();
vi.mock("@/lib/blob", () => ({
  blobConfigured: () => true,
  readBlob: async (p: string) => store.get(p) ?? null,
  writeBlob: async (p: string, body: string) => void store.set(p, Buffer.from(body)),
  listBlobPaths: async (prefix: string) => [...store.keys()].filter((k) => k.startsWith(prefix)),
  deleteBlob: async (p: string) => void store.delete(p),
}));

const { newCard } = await import("@/lib/cards");
const { deleteCard, getCard, listCards, saveCard } = await import("@/lib/store/cards");

const out = {
  translit: "ana bedi aroh", arabic: "أنا بدي أروح", tts_spelling: "أنا بِدّي أروح", notes: "",
  words: [{ en: "I", translit: "ana", arabic: "أنا", tts_spelling: "أنا", known: true }],
};

describe("cards", () => {
  beforeEach(() => store.clear());

  it("starts unverified, unstarred, due now", () => {
    const now = new Date("2026-10-02T10:00:00Z");
    const card = newCard("I want to go", out, "claude-opus-5-5", now, "00000000-0000-0000-0000-000000000001");
    expect(card).toMatchObject({
      english: "I want to go", status: "unverified", starred: false, source_model: "claude-opus-5-5",
      review: { due_at: "2026-10-02T10:00:00.000Z", ease: 2.5, interval_days: 0, reps: 0 },
    });
  });

  it("saves, lists oldest first, updates and deletes", async () => {
    const a = newCard("first", out, "m", new Date("2026-10-01T00:00:00Z"), "00000000-0000-0000-0000-00000000000a");
    const b = newCard("second", out, "m", new Date("2026-10-02T00:00:00Z"), "00000000-0000-0000-0000-00000000000b");
    await saveCard(b);
    await saveCard(a);
    expect((await listCards()).map((c) => c.english)).toEqual(["first", "second"]);
    await saveCard({ ...a, starred: true });
    expect((await getCard(a.id))?.starred).toBe(true);
    await deleteCard(a.id);
    expect((await listCards()).map((c) => c.english)).toEqual(["second"]);
  });

  it("ignores ids that are not UUIDs", async () => {
    expect(await getCard("../tts/x")).toBeNull();
  });
});
