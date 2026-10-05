import { requirePasscode } from "@/lib/auth";
import { resolveGraderModel } from "@/lib/grader/models";
import { findNonPreferred } from "@/lib/lexicon";
import { proposeKeyRewrite } from "@/lib/say/rewrite";
import { findPromptWithKey } from "@/lib/store/answerKeys";
import { loadLexicon } from "@/lib/store/lexicon";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST {promptId, model?} → a proposed rewrite using preferred forms. Nothing is saved here. */
export async function POST(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "not configured (ANTHROPIC_API_KEY)" }, { status: 412 });
  const body = (await req.json().catch(() => null)) as { promptId?: string; model?: string } | null;
  const prompt = body?.promptId ? await findPromptWithKey(body.promptId) : undefined;
  if (!prompt?.answerKey) return Response.json({ error: "unknown promptId or no answer key" }, { status: 400 });
  const model = resolveGraderModel(body?.model);
  if (!model) return Response.json({ error: `model not allowed: ${body?.model}` }, { status: 400 });

  const uses = findNonPreferred(prompt.answerKey.translit, await loadLexicon());
  if (uses.length === 0) return Response.json({ error: "this key already uses your preferred forms" }, { status: 409 });
  try {
    const { data } = await proposeKeyRewrite(prompt.en, prompt.answerKey, uses, model);
    return Response.json({ current: prompt.answerKey, proposed: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
