import { requirePasscode } from "@/lib/auth";
import { newCard } from "@/lib/cards";
import { resolveGraderModel } from "@/lib/grader/models";
import { generateSentence } from "@/lib/say/generate";
import { cardStoreConfigured, getCard, saveCard } from "@/lib/store/cards";
import { allAnswerKeyOverrides } from "@/lib/store/answerKeys";
import { loadLexicon } from "@/lib/store/lexicon";
import { findSentenceByEnglish, sentenceId } from "@/lib/store/review";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST {english, model?, save?, cardId?} → an unverified card in the learner's preferred forms (saved unless
 * save=false, e.g. the voice test page). With cardId, regenerates that card in place (keeps its star and date).
 */
export async function POST(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "not configured (ANTHROPIC_API_KEY)" }, { status: 412 });
  }

  const body = (await req.json().catch(() => null)) as { english?: string; model?: string; save?: boolean; cardId?: string } | null;
  const english = body?.english?.trim() ?? "";
  if (!english) return Response.json({ error: "empty sentence" }, { status: 400 });
  if (english.length > 300) return Response.json({ error: "sentence too long (300 characters max)" }, { status: 400 });
  const model = resolveGraderModel(body?.model);
  if (!model) return Response.json({ error: `model not allowed: ${body?.model}` }, { status: 400 });

  const started = Date.now();
  let generated;
  let linked: { sentence_id: string; key_status: "unverified" | "verified" } | undefined;
  try {
    // An answer-key sentence keeps its key's text, so a reviewer recording of it matches the card.
    const sentence = findSentenceByEnglish(english);
    const key = sentence ? ((await allAnswerKeyOverrides())[sentence.en] ?? sentence.answer_key) : undefined;
    generated = await generateSentence(english, model, await loadLexicon(), key);
    if (sentence && key) linked = { sentence_id: sentenceId(sentence.en), key_status: key.status as "unverified" | "verified" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message, ms: Date.now() - started }, { status: 502 });
  }
  const previous = body?.cardId && cardStoreConfigured() ? await getCard(body.cardId).catch(() => null) : null;
  const fresh = { ...newCard(english, generated.data, generated.model), ...linked };
  const card = previous
    ? { ...fresh, id: previous.id, starred: previous.starred, created_at: previous.created_at, review: previous.review }
    : fresh;
  const ms = Date.now() - started;

  let saved = false;
  let saveError: string | undefined;
  if (body?.save !== false && cardStoreConfigured()) {
    try {
      await saveCard(card);
      saved = true;
    } catch (err) {
      saveError = err instanceof Error ? err.message : String(err);
    }
  }
  return Response.json({ card, saved, saveError, usage: generated.usage, attempts: generated.attempts, ms });
}
