import { blobConfigured, readBlob, writeBlob } from "@/lib/blob";
import type { SoundId } from "@/lib/langpacks/sounds";

// "My weak sounds": one event per sound error found by a consensus grade, plus a count of graded attempts.
const PATH = "stats/sounds.json";
const MAX_EVENTS = 2000;

export type SoundEvent = { at: string; sound: SoundId; word: string; heard: string; source: string };
export type SoundStats = { attempts: number; events: SoundEvent[] };

async function load(): Promise<SoundStats> {
  const raw = await readBlob(PATH, { fresh: true });
  return raw ? (JSON.parse(raw.toString("utf8")) as SoundStats) : { attempts: 0, events: [] };
}

/** Best effort: a stats failure must never fail the grade. */
export async function recordSoundErrors(
  errors: { sound: SoundId; word: string; heard: string }[],
  source: string,
  now = new Date(),
): Promise<void> {
  if (!blobConfigured()) return;
  try {
    const stats = await load();
    stats.attempts += 1;
    stats.events.push(...errors.map((e) => ({ at: now.toISOString(), sound: e.sound, word: e.word, heard: e.heard, source })));
    stats.events = stats.events.slice(-MAX_EVENTS);
    await writeBlob(PATH, JSON.stringify(stats), "application/json");
  } catch (err) {
    console.error("[sound-stats] could not record:", err);
  }
}

export async function loadSoundStats(): Promise<SoundStats> {
  if (!blobConfigured()) return { attempts: 0, events: [] };
  return load();
}

export type WeakSound = { sound: SoundId; total: number; recent: number; lastAt: string; examples: { word: string; heard: string }[] };

/** Sounds ranked by errors in the last `days` days, then all time. */
export function summarizeWeakSounds(stats: SoundStats, now = new Date(), days = 14): WeakSound[] {
  const since = now.getTime() - days * 86_400_000;
  const by = new Map<SoundId, WeakSound>();
  for (const e of stats.events) {
    const w = by.get(e.sound) ?? { sound: e.sound, total: 0, recent: 0, lastAt: e.at, examples: [] };
    w.total += 1;
    if (Date.parse(e.at) >= since) w.recent += 1;
    if (e.at > w.lastAt) w.lastAt = e.at;
    if (!w.examples.some((x) => x.word === e.word && x.heard === e.heard)) w.examples.unshift({ word: e.word, heard: e.heard });
    w.examples = w.examples.slice(0, 3);
    by.set(e.sound, w);
  }
  return [...by.values()].sort((a, b) => b.recent - a.recent || b.total - a.total);
}
