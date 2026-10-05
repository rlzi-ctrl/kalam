import { requirePasscode } from "@/lib/auth";
import { resolveGraderModel } from "@/lib/grader/models";
import { soundById } from "@/lib/langpacks/sounds";
import { generatePairs } from "@/lib/pairs/generate";
import type { MinimalPair } from "@/lib/pairs/schema";
import { loadLexicon } from "@/lib/store/lexicon";
import { listPairs, pairStoreConfigured, savePairs } from "@/lib/store/pairs";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!pairStoreConfigured()) return Response.json({ configured: false, pairs: [] });
  return Response.json({ configured: true, pairs: await listPairs() });
}

/** POST {sound, model?} → generates candidate pairs, saved as "unverified" until a reviewer approves them. */
export async function POST(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!pairStoreConfigured()) return Response.json({ error: "Saving pairs needs BLOB_READ_WRITE_TOKEN" }, { status: 412 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "not configured (ANTHROPIC_API_KEY)" }, { status: 412 });
  const body = (await req.json().catch(() => null)) as { sound?: string; model?: string } | null;
  const sound = body?.sound ? soundById(body.sound) : undefined;
  if (!sound || sound.heardAs.filter((h) => !h.startsWith("(")).length === 0) {
    return Response.json({ error: "unknown sound, or no contrast sound to pair it with" }, { status: 400 });
  }
  const model = resolveGraderModel(body?.model);
  if (!model) return Response.json({ error: `model not allowed: ${body?.model}` }, { status: 400 });

  try {
    const candidates = await generatePairs(sound, await loadLexicon(), model);
    const existing = await listPairs();
    const seen = new Set(existing.map((p) => `${p.target.arabic}|${p.contrast.arabic}`));
    const now = new Date().toISOString();
    const added: MinimalPair[] = candidates
      .filter((c) => !seen.has(`${c.target.arabic}|${c.contrast.arabic}`))
      .map((c) => ({ ...c, id: crypto.randomUUID(), sound: sound.id, status: "unverified", created_at: now }));
    await savePairs([...existing, ...added]);
    return Response.json({ added });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
