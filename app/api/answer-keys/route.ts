import { requirePasscode } from "@/lib/auth";
import { blobConfigured } from "@/lib/blob";
import { findNonPreferred } from "@/lib/lexicon";
import { allAnswerKeyOverrides, findPromptWithKey, saveAnswerKey } from "@/lib/store/answerKeys";
import { loadLexicon } from "@/lib/store/lexicon";
import { TEST_PROMPTS } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the test prompts' current answer keys and which preferred forms each one is missing. */
export async function GET(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  const [concepts, overrides] = await Promise.all([loadLexicon(), allAnswerKeyOverrides()]);
  const keys = TEST_PROMPTS.filter((p) => p.answerKey).map((p) => {
    const key = overrides[p.en] ?? p.answerKey!;
    const stale = findNonPreferred(key.translit, concepts).map((u) => ({
      concept: u.concept.en,
      used: u.used.translit,
      preferred: u.preferred.translit,
    }));
    return {
      promptId: p.id,
      translit: key.translit,
      arabic: key.arabic,
      status: key.status,
      rewritten: Boolean(overrides[p.en]),
      reviewed: overrides[p.en]?.review?.action,
      stale,
    };
  });
  return Response.json({ keys });
}

/** POST {promptId, translit, arabic} → saves an approved rewrite (still "unverified" until the tutor checks it). */
export async function POST(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!blobConfigured()) return Response.json({ error: "Saving needs BLOB_READ_WRITE_TOKEN" }, { status: 412 });
  const body = (await req.json().catch(() => null)) as { promptId?: string; translit?: string; arabic?: string } | null;
  const prompt = body?.promptId ? await findPromptWithKey(body.promptId) : undefined;
  if (!prompt?.answerKey) return Response.json({ error: "unknown promptId or no answer key" }, { status: 400 });
  const ok = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= 600;
  if (!ok(body?.translit) || !ok(body?.arabic)) return Response.json({ error: "translit and arabic required" }, { status: 400 });
  await saveAnswerKey(prompt.en, { translit: body.translit.trim(), arabic: body.arabic.trim() });
  return Response.json({ ok: true });
}
