import { requireReviewer } from "@/lib/auth";
import { levantine } from "@/lib/langpacks/levantine";
import { allAnswerKeyOverrides, saveReviewedKey } from "@/lib/store/answerKeys";
import { findSentence, reviewStoreConfigured } from "@/lib/store/review";

export const runtime = "nodejs";

type Body = { action?: string; translit?: unknown; arabic?: unknown; note?: unknown };

/** POST {action: "correct"} or {action: "edit", translit, arabic, note?}: both mark the key verified. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireReviewer(req);
  if (denied) return denied;
  if (!reviewStoreConfigured()) return Response.json({ error: "Saving reviews needs BLOB_READ_WRITE_TOKEN" }, { status: 412 });
  const { id } = await ctx.params;
  const sentence = findSentence(id);
  if (!sentence) return Response.json({ error: "unknown sentence" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Body | null;
  const current = (await allAnswerKeyOverrides())[sentence.en] ?? sentence.answer_key;
  const at = new Date().toISOString();
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : undefined;

  if (body?.action === "correct") {
    const key = await saveReviewedKey(sentence.en, current, { action: "correct", at, note });
    return Response.json({ key });
  }
  if (body?.action === "edit") {
    const ok = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= 600;
    if (!ok(body.translit) || !ok(body.arabic)) return Response.json({ error: "transliteration and Arabic are both needed" }, { status: 400 });
    const arabic = body.arabic.trim();
    // Latin letters in the Arabic field are almost always a slip (e.g. the transliteration pasted twice).
    if (levantine.transcriptProblem(arabic)?.includes("Latin")) {
      return Response.json({ error: "The Arabic field has Latin letters in it." }, { status: 400 });
    }
    const key = await saveReviewedKey(
      sentence.en,
      { translit: body.translit.trim(), arabic },
      { action: "edited", at, note, previous: { translit: current.translit, arabic: current.arabic } },
    );
    return Response.json({ key });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
