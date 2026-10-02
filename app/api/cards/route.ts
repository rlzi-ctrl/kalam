import { requirePasscode } from "@/lib/auth";
import { cardStoreConfigured, listCards } from "@/lib/store/cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!cardStoreConfigured()) return Response.json({ configured: false, cards: [] });
  try {
    return Response.json({ configured: true, cards: await listCards() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
