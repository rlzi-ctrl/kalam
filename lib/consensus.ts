// Shared by the page (to label columns) and the grade route (authoritative).
import { levantine } from "@/lib/langpacks/levantine";

/** Always vote when their transcript is usable. */
export const CORE_VOTERS = ["elevenlabs", "openai-whisper-1"];
/** Vote only when switched on (gpt-4o-transcribe often returns unrelated text or the wrong script). */
export const OPT_IN_VOTERS = ["openai-gpt-4o-transcribe"];
const AZURE_PREFIX = "azure-";

export const isAzure = (providerId: string) => providerId.startsWith(AZURE_PREFIX);
export const isConsensusProvider = (providerId: string) =>
  CORE_VOTERS.includes(providerId) || OPT_IN_VOTERS.includes(providerId) || isAzure(providerId);

export type Transcript = { providerId: string; label: string; text: string };
export type Discarded = { providerId: string; label: string; reason: string };
/** Usable transcripts that still don't vote (opt-in off, or outvoted inside the Azure group). */
export type Skipped = Discarded;
export type ConsensusOptions = { optIn?: string[] };
export type ConsensusSelection = { used: Transcript[]; discarded: Discarded[]; skipped: Skipped[] };

export function selectForConsensus(transcripts: Transcript[], opts: ConsensusOptions = {}): ConsensusSelection {
  const used: Transcript[] = [];
  const discarded: Discarded[] = [];
  const skipped: Skipped[] = [];
  const azure: Transcript[] = [];

  for (const t of transcripts) {
    if (!isConsensusProvider(t.providerId)) continue;
    if (OPT_IN_VOTERS.includes(t.providerId) && !opts.optIn?.includes(t.providerId)) {
      skipped.push({ providerId: t.providerId, label: t.label, reason: "opt-in, switched off" });
      continue;
    }
    const reason = levantine.transcriptProblem(t.text);
    if (reason) discarded.push({ providerId: t.providerId, label: t.label, reason });
    else if (isAzure(t.providerId)) azure.push(t);
    else used.push(t);
  }

  if (azure.length) {
    const { vote, why } = pickAzureVote(azure);
    used.push({ ...vote, label: `${vote.label} — the Azure vote (${why})` });
    for (const t of azure) {
      if (t !== vote) skipped.push({ providerId: t.providerId, label: t.label, reason: `Azure counts as one vote: ${why}` });
    }
  }
  return { used, discarded, skipped };
}

/** One Azure transcript stands for all locales: the majority reading, or the preferred locale if they disagree. */
export function pickAzureVote(group: Transcript[]): { vote: Transcript; why: string } {
  const preferredId = `${AZURE_PREFIX}${levantine.preferredAzureLocale}`;
  const locale = (t: Transcript) => t.providerId.slice(AZURE_PREFIX.length);
  if (group.length === 1) return { vote: group[0], why: `${locale(group[0])} is the only usable Azure locale` };

  const byReading = new Map<string, Transcript[]>();
  for (const t of group) {
    const key = levantine.normalizeForComparison(t.text);
    byReading.set(key, [...(byReading.get(key) ?? []), t]);
  }
  const largest = [...byReading.values()].sort((a, b) => b.length - a.length)[0];
  if (largest.length * 2 > group.length) {
    const vote = largest.find((t) => t.providerId === preferredId) ?? largest[0];
    return { vote, why: `${largest.length} of ${group.length} Azure locales agreed, using ${locale(vote)}` };
  }
  const preferred = group.find((t) => t.providerId === preferredId);
  if (preferred) return { vote: preferred, why: `Azure locales disagreed, using ${locale(preferred)}` };
  return { vote: group[0], why: `Azure locales disagreed and ${levantine.preferredAzureLocale} was unusable, using ${locale(group[0])}` };
}

/** An error counts against the learner only if more than half of the votes show it. */
export function majorityOf(n: number): number {
  return Math.floor(n / 2) + 1;
}
