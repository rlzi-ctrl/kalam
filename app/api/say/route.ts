import { requirePasscode } from "@/lib/auth";
import { newCard } from "@/lib/cards";
import { resolveGraderModel } from "@/lib/grader/models";
import { generateSentence } from "@/lib/say/generate";
import { cardStoreConfigured, saveCard } from "@/lib/store/cards";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST {english, model?, save?} → a new unverified card (saved unless save=false, e.g. the voice test page). */
export async function POST(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "not configured (ANTHROPIC_API_KEY)" }, { status: 412 });
  }

  const body = (await req.json().catch(() => null)) as { english?: string; model?: string; save?: boolean } | null;
  const english = body?.english?.trim() ?? "";
  if (!english) return Response.json({ error: "empty sentence" }, { status: 400 });
  if (english.length > 300) return Response.json({ error: "sentence too long (300 characters max)" }, { status: 400 });
  const model = resolveGraderModel(body?.model);
  if (!model) return Response.json({ error: `model not allowed: ${body?.model}` }, { status: 400 });

  const started = Date.now();
  let generated;
  try {
    generated = await generateSentence(english, model);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message, ms: Date.now() - started }, { status: 502 });
  }
  const card = newCard(english, generated.data, generated.model);
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
