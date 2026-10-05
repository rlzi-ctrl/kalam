import { majorityOf, type Transcript } from "@/lib/consensus";
import type { LanguagePack } from "@/lib/langpacks/levantine";
import { variantsPromptBlock, vocabPromptBlock, type Concept } from "@/lib/lexicon";
import { grammarForGrader, reviewFlagsForGrader, type TestPrompt } from "@/lib/seed";

const MARKING_RULES = `Marking against several transcripts:
- You receive one or more independent STT transcripts of the same recording. No single transcript is reliable; agreement between them is the evidence.
- Count an error against the learner only if at least the number of transcripts given in errors_need_agreement_of show it. An error seen in fewer transcripts is STT noise: do not list it in errors and do not deduct for it.
- When transcripts disagree on a word, give the learner the benefit of the doubt for meaning and grammar.
- consensus_note: one or two sentences on where the transcripts agreed and which disagreements you treated as STT noise. If only one transcript was given, say that nothing could be cross-checked.

Marking against the answer key:
- When an answer_key is given, mark against it. In the fix fields use the key's exact spellings.
- A different wording that is correct Levantine and means the same is not an error.
- corrected_translit and corrected_arabic must be the answer key copied exactly.
- The key is unverified. If you think it contains a mistake, still mark against it, and add one sentence to consensus_note starting "Key check:".`;

/** Stable until the learner changes a preference, so it is prompt-cached. */
export function buildSystemPrompt(pack: LanguagePack, concepts: Concept[]): string {
  return `${pack.graderRubric}

${MARKING_RULES}

${pack.soundRules()}

Score each of meaning, grammar, vocabulary and overall from 0 to 100.

<learner_known_vocabulary>
Format: English = preferred transliteration (Arabic). Lessons 1-20 are all unlocked.
${vocabPromptBlock(concepts)}
</learner_known_vocabulary>

<accepted_variants>
Concepts with more than one accepted form. Any of them is correct with no penalty; use the preferred one in fixes.
${variantsPromptBlock(concepts)}
</accepted_variants>

<grammar_from_tutor_notes>
${grammarForGrader()}
</grammar_from_tutor_notes>

<known_issues_in_the_vocabulary_list>
These glosses in the list above are suspected to be wrong. Do not treat the flagged forms as authoritative.
${reviewFlagsForGrader()}
</known_issues_in_the_vocabulary_list>`;
}

export function buildUserMessage(prompt: TestPrompt, transcripts: Transcript[]): string {
  const lines = [`<target_english>${prompt.en}</target_english>`];
  if (prompt.answerKey) {
    lines.push(
      `<answer_key status="${prompt.answerKey.status}">`,
      `translit: ${prompt.answerKey.translit}`,
      `arabic: ${prompt.answerKey.arabic}`,
      `</answer_key>`,
    );
  }
  if (prompt.referenceTranslit) {
    lines.push(`<reference_translit source="tutor notes">${prompt.referenceTranslit}</reference_translit>`);
  }
  if (prompt.tutorPartial) {
    lines.push(`<tutor_partial_answer>${prompt.tutorPartial}</tutor_partial_answer>`);
  }
  lines.push(`<transcripts count="${transcripts.length}" errors_need_agreement_of="${majorityOf(transcripts.length)}">`);
  for (const t of transcripts) lines.push(`<transcript source="${t.label}">${t.text}</transcript>`);
  lines.push("</transcripts>");
  lines.push("Grade what the learner said against the target English.");
  return lines.join("\n");
}
