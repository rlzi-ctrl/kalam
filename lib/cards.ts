import type { SayOutput } from "@/lib/say/schema";

/** A saved "Say it" sentence. Review fields follow CLAUDE.md's review_card (scheduling comes in Phase 1). */
export type Card = SayOutput & {
  id: string;
  english: string;
  status: "unverified" | "verified";
  /** "Ask my tutor". */
  starred: boolean;
  created_at: string;
  updated_at: string;
  source_model: string;
  review: { due_at: string; ease: number; interval_days: number; reps: number };
};

export function newCard(english: string, out: SayOutput, model: string, now = new Date(), id = crypto.randomUUID()): Card {
  const at = now.toISOString();
  return {
    ...out,
    id,
    english,
    status: "unverified",
    starred: false,
    created_at: at,
    updated_at: at,
    source_model: model,
    review: { due_at: at, ease: 2.5, interval_days: 0, reps: 0 },
  };
}
