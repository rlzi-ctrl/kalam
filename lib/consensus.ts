// Shared by the page (to label columns) and the grade route (authoritative).
import { levantine } from "@/lib/langpacks/levantine";

/** Providers whose transcripts are combined into one consensus grade. */
export const CONSENSUS_PROVIDER_IDS = ["elevenlabs", "openai-whisper-1", "openai-gpt-4o-transcribe"];

export type Transcript = { providerId: string; label: string; text: string };
export type Discarded = { providerId: string; label: string; reason: string };

export function selectForConsensus(transcripts: Transcript[]): { used: Transcript[]; discarded: Discarded[] } {
  const used: Transcript[] = [];
  const discarded: Discarded[] = [];
  for (const t of transcripts) {
    if (!CONSENSUS_PROVIDER_IDS.includes(t.providerId)) continue;
    const reason = levantine.transcriptProblem(t.text);
    if (reason) discarded.push({ providerId: t.providerId, label: t.label, reason });
    else used.push(t);
  }
  return { used, discarded };
}

/** An error counts against the learner only if more than half of the usable transcripts show it. */
export function majorityOf(n: number): number {
  return Math.floor(n / 2) + 1;
}
