import { requirePasscode } from "@/lib/auth";
import { OPT_IN_VOTERS, selectForConsensus, type ConsensusSelection, type Transcript } from "@/lib/consensus";
import { gradeTranscripts } from "@/lib/grader/grade";
import { resolveGraderModel } from "@/lib/grader/models";
import { findPrompt, type TestPrompt } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  promptId?: string;
  /** Instead of promptId: grade against an ad-hoc sentence (a "Say it" card). */
  item?: { en?: unknown; translit?: unknown; arabic?: unknown };
  /** "consensus" (default): filter and combine the consensus providers. "single": grade one transcript as-is. */
  mode?: "consensus" | "single";
  model?: string;
  transcripts?: Transcript[];
  /** Opt-in voters to include, e.g. ["openai-gpt-4o-transcribe"]. */
  optIn?: string[];
};

export async function POST(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "grader not configured (ANTHROPIC_API_KEY)" }, { status: 412 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const prompt = body?.promptId ? findPrompt(body.promptId) : itemPrompt(body?.item);
  if (!prompt) return Response.json({ error: "unknown promptId or invalid item" }, { status: 400 });
  const model = resolveGraderModel(body?.model);
  if (!model) return Response.json({ error: `model not allowed: ${body?.model}` }, { status: 400 });

  const transcripts = (Array.isArray(body?.transcripts) ? body.transcripts : [])
    .filter((t) => typeof t?.providerId === "string" && typeof t?.label === "string" && typeof t?.text === "string")
    .map((t) => ({ providerId: t.providerId, label: t.label, text: t.text.trim() }));
  if (transcripts.length === 0 || transcripts.length > 8) {
    return Response.json({ error: "expected 1-8 transcripts" }, { status: 400 });
  }
  if (transcripts.some((t) => t.text.length > 2000)) {
    return Response.json({ error: "transcript too long" }, { status: 400 });
  }

  const optIn = (Array.isArray(body?.optIn) ? body.optIn : []).filter((id) => OPT_IN_VOTERS.includes(id));

  let used: Transcript[];
  let discarded: ConsensusSelection["discarded"] = [];
  let skipped: ConsensusSelection["skipped"] = [];
  if (body?.mode === "single") {
    if (transcripts.length !== 1 || !transcripts[0].text) {
      return Response.json({ error: "single mode needs one non-empty transcript" }, { status: 400 });
    }
    used = transcripts;
  } else {
    ({ used, discarded, skipped } = selectForConsensus(transcripts, { optIn }));
    if (used.length === 0) {
      return Response.json({ error: "no usable transcripts for consensus", discarded, skipped }, { status: 422 });
    }
  }

  const started = Date.now();
  try {
    const outcome = await gradeTranscripts(prompt, used, model);
    return Response.json({
      ...outcome,
      requestedModel: model,
      used: used.map((t) => t.providerId),
      discarded,
      skipped,
      optIn,
      ms: Date.now() - started,
    });
  } catch (err) {
    // Always 502: an upstream 401 must not look like a wrong app passcode to the client.
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message, discarded, skipped, ms: Date.now() - started }, { status: 502 });
  }
}

function itemPrompt(item: Body["item"]): TestPrompt | undefined {
  const ok = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 600;
  if (!item || !ok(item.en) || !ok(item.translit) || !ok(item.arabic)) return undefined;
  return {
    id: "item",
    kind: "sentence",
    en: item.en,
    answerKey: { translit: item.translit, arabic: item.arabic, status: "unverified" },
  };
}
