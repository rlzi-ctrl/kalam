import { requirePasscode } from "@/lib/auth";
import { blobConfigured } from "@/lib/blob";
import { loadSoundStats, summarizeWeakSounds } from "@/lib/store/soundStats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → "my weak sounds": sound errors from consensus grades, ranked. */
export async function GET(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!blobConfigured()) return Response.json({ configured: false, attempts: 0, weak: [] });
  try {
    const stats = await loadSoundStats();
    return Response.json({ configured: true, attempts: stats.attempts, weak: summarizeWeakSounds(stats) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
