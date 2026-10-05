import { requirePasscode } from "@/lib/auth";
import { listPairs, pairStoreConfigured, savePairs } from "@/lib/store/pairs";

export const runtime = "nodejs";

/** PATCH {status: "verified" | "rejected" | "unverified"}: the reviewer's decision. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!pairStoreConfigured()) return Response.json({ error: "not configured (BLOB_READ_WRITE_TOKEN)" }, { status: 412 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { status?: string } | null;
  if (!["verified", "rejected", "unverified"].includes(body?.status ?? "")) {
    return Response.json({ error: "status must be verified, rejected or unverified" }, { status: 400 });
  }
  const pairs = await listPairs();
  const pair = pairs.find((p) => p.id === id);
  if (!pair) return Response.json({ error: "pair not found" }, { status: 404 });
  pair.status = body!.status as typeof pair.status;
  pair.reviewed_at = new Date().toISOString();
  await savePairs(pairs);
  return Response.json({ pair });
}
