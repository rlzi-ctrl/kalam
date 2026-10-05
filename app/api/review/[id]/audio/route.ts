import { requireLearnerOrReviewer, requireReviewer } from "@/lib/auth";
import { allAnswerKeyOverrides } from "@/lib/store/answerKeys";
import { deleteRecording, findSentence, readRecording, reviewStoreConfigured, saveRecording } from "@/lib/store/review";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET → the reviewer's recording (MP3). The learner can play it too. */
export async function GET(req: Request, ctx: Ctx) {
  const denied = requireLearnerOrReviewer(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!findSentence(id)) return Response.json({ error: "unknown sentence" }, { status: 404 });
  const audio = await readRecording(id);
  if (!audio) return Response.json({ error: "no recording" }, { status: 404 });
  return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-cache" } });
}

/** POST multipart {audio: MP3} → saves the reviewer's recording of the sentence's current key. */
export async function POST(req: Request, ctx: Ctx) {
  const denied = requireReviewer(req);
  if (denied) return denied;
  if (!reviewStoreConfigured()) return Response.json({ error: "Saving recordings needs BLOB_READ_WRITE_TOKEN" }, { status: 412 });
  const { id } = await ctx.params;
  const sentence = findSentence(id);
  if (!sentence) return Response.json({ error: "unknown sentence" }, { status: 404 });
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "missing audio" }, { status: 400 });
  const key = (await allAnswerKeyOverrides())[sentence.en] ?? sentence.answer_key;
  try {
    const saved = await saveRecording(id, Buffer.from(await audio.arrayBuffer()), { en: sentence.en, translit: key.translit, arabic: key.arabic });
    return Response.json({ recording: { recorded_at: saved.recorded_at, bytes: saved.bytes, matchesKey: true } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requireReviewer(req);
  if (denied) return denied;
  if (!reviewStoreConfigured()) return Response.json({ error: "not configured (BLOB_READ_WRITE_TOKEN)" }, { status: 412 });
  const { id } = await ctx.params;
  if (!findSentence(id)) return Response.json({ error: "unknown sentence" }, { status: 404 });
  await deleteRecording(id);
  return Response.json({ ok: true });
}
