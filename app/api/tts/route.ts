import { requirePasscode } from "@/lib/auth";
import { getVoice, speak } from "@/lib/tts/registry";
import { missingEnv } from "@/lib/tts/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHARS = 600;

/** POST {voiceId, text} → MP3 bytes. Headers report cache hit/miss and billed characters. */
export async function POST(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { voiceId?: string; text?: string } | null;
  const voice = body?.voiceId ? getVoice(body.voiceId) : undefined;
  const text = body?.text?.trim() ?? "";
  if (!voice) return Response.json({ error: `unknown voice: ${body?.voiceId}` }, { status: 400 });
  const missing = missingEnv(voice);
  if (missing.length) return Response.json({ error: "not configured", missing }, { status: 412 });
  if (!text) return Response.json({ error: "empty text" }, { status: 400 });
  if (text.length > MAX_CHARS) return Response.json({ error: "text too long" }, { status: 400 });

  const started = Date.now();
  try {
    const { audio, cache } = await speak(voice, text);
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-TTS-Cache": cache,
        // Characters billed by the TTS provider for this request (0 on a cache hit).
        "X-TTS-Chars": String(cache === "hit" ? 0 : text.length),
        "X-TTS-Ms": String(Date.now() - started),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message, ms: Date.now() - started }, { status: 502 });
  }
}
