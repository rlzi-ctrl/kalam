import { requirePasscode } from "@/lib/auth";
import { cardStoreConfigured, deleteCard, getCard, saveCard } from "@/lib/store/cards";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH {starred} → updated card. */
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!cardStoreConfigured()) return Response.json({ error: "not configured (BLOB_READ_WRITE_TOKEN)" }, { status: 412 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { starred?: unknown } | null;
  if (typeof body?.starred !== "boolean") return Response.json({ error: "expected {starred: boolean}" }, { status: 400 });

  const card = await getCard(id);
  if (!card) return Response.json({ error: "card not found" }, { status: 404 });
  const updated = { ...card, starred: body.starred, updated_at: new Date().toISOString() };
  await saveCard(updated);
  return Response.json({ card: updated });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!cardStoreConfigured()) return Response.json({ error: "not configured (BLOB_READ_WRITE_TOKEN)" }, { status: 412 });
  const { id } = await ctx.params;
  await deleteCard(id);
  return Response.json({ ok: true });
}
