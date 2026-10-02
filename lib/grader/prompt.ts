import type { LanguagePack } from "@/lib/langpacks/levantine";
import { grammarForGrader, reviewFlagsForGrader, vocabForGrader, type TestPrompt } from "@/lib/seed";

/** Stable across requests, so it is prompt-cached. */
export function buildSystemPrompt(pack: LanguagePack): string {
  return `${pack.graderRubric}

Score each of meaning, grammar, vocabulary and overall from 0 to 100.

<learner_known_vocabulary>
Format: English = transliteration (Arabic, when the notes have it). Lessons 1-20 are all unlocked.
${vocabForGrader()}
</learner_known_vocabulary>

<grammar_from_tutor_notes>
${grammarForGrader()}
</grammar_from_tutor_notes>

<known_issues_in_the_vocabulary_list>
These glosses in the list above are suspected to be wrong. Do not treat the flagged forms as authoritative.
${reviewFlagsForGrader()}
</known_issues_in_the_vocabulary_list>`;
}

export function buildUserMessage(prompt: TestPrompt, transcript: string, providerLabel: string): string {
  const lines = [`<target_english>${prompt.en}</target_english>`];
  if (prompt.referenceTranslit) {
    lines.push(`<reference_translit source="tutor notes">${prompt.referenceTranslit}</reference_translit>`);
  }
  if (prompt.tutorPartial) {
    lines.push(`<tutor_partial_answer>${prompt.tutorPartial}</tutor_partial_answer>`);
  }
  lines.push(`<stt_provider>${providerLabel}</stt_provider>`);
  lines.push(`<learner_heard>${transcript}</learner_heard>`);
  lines.push("Grade what the learner said against the target English.");
  return lines.join("\n");
}
