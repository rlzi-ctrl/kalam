import { z } from "zod";
import { structuredCall } from "@/lib/claude/structured";
import { type NonPreferredUse } from "@/lib/lexicon";

const RewriteSchema = z.object({
  translit: z.string().min(1),
  arabic: z.string().min(1),
  changes: z.array(z.object({ from: z.string(), to: z.string() })),
});

const str = { type: "string" } as const;
const REWRITE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["translit", "arabic", "changes"],
  properties: {
    translit: str,
    arabic: str,
    changes: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: str, to: str } },
    },
  },
};

const SYSTEM = `You edit Levantine Arabic answer keys for a learner. You get a sentence (Latin-script Arabizi translit + Arabic script) and the learner's preferred forms for some concepts. Rewrite the sentence so it uses the preferred forms, adjusting only what the swap requires (agreement, attached pronoun suffixes, article). Change nothing else: keep every other word and spelling exactly as given. Keep the learner's translit style (3=ع, 2=ء, lowercase, hyphens). List each change as {from, to} in translit.`;

/** Proposes a rewrite of an answer key with the learner's preferred forms. Never saved without approval. */
export async function proposeKeyRewrite(
  en: string,
  key: { translit: string; arabic: string },
  uses: NonPreferredUse[],
  model: string,
) {
  const prefs = uses
    .map((u) => `- ${u.concept.en}: use ${u.preferred.translit} (${u.preferred.arabic}) instead of ${u.used.translit} (${u.used.arabic})`)
    .join("\n");
  return structuredCall({
    model,
    system: SYSTEM,
    user: `<english>${en}</english>\n<translit>${key.translit}</translit>\n<arabic>${key.arabic}</arabic>\n<preferred_forms>\n${prefs}\n</preferred_forms>`,
    jsonSchema: REWRITE_JSON_SCHEMA,
    schema: RewriteSchema,
    effort: "low",
  });
}
