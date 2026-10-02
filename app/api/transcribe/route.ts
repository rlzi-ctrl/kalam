import { requirePasscode } from "@/lib/auth";
import { levantine } from "@/lib/langpacks/levantine";
import { getProvider } from "@/lib/stt/registry";
import { missingEnv } from "@/lib/stt/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request limit

export async function POST(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;

  const form = await req.formData();
  const providerId = String(form.get("provider") ?? "");
  const audio = form.get("audio");

  const provider = getProvider(providerId);
  if (!provider) return Response.json({ error: `unknown provider: ${providerId}` }, { status: 400 });
  const missing = missingEnv(provider);
  if (missing.length) {
    return Response.json({ error: "not configured", missing }, { status: 412 });
  }
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "missing audio" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) return Response.json({ error: "clip too large" }, { status: 413 });

  const wav = Buffer.from(await audio.arrayBuffer());
  const started = Date.now();
  try {
    const result = await provider.transcribe({ wav, language: levantine.sttLanguage });
    return Response.json({ ...result, ms: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message, ms: Date.now() - started }, { status: 502 });
  }
}
