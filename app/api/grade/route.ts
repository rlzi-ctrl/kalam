import { requirePasscode } from "@/lib/auth";
import { gradeTranscript } from "@/lib/grader/grade";
import { findPrompt } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "grader not configured (ANTHROPIC_API_KEY)" }, { status: 412 });
  }

  const body = (await req.json().catch(() => null)) as
    | { promptId?: string; transcript?: string; providerLabel?: string }
    | null;
  const prompt = body?.promptId ? findPrompt(body.promptId) : undefined;
  const transcript = body?.transcript?.trim() ?? "";
  if (!prompt) return Response.json({ error: "unknown promptId" }, { status: 400 });
  if (!transcript) return Response.json({ error: "empty transcript" }, { status: 400 });
  if (transcript.length > 2000) return Response.json({ error: "transcript too long" }, { status: 400 });

  const started = Date.now();
  try {
    const outcome = await gradeTranscript(prompt, transcript, body?.providerLabel ?? "unknown");
    return Response.json({ ...outcome, ms: Date.now() - started });
  } catch (err) {
    // Always 502: an upstream 401 must not look like a wrong app passcode to the client.
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message, ms: Date.now() - started }, { status: 502 });
  }
}
