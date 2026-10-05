import { requireReviewer } from "@/lib/auth";
import { levantine } from "@/lib/langpacks/levantine";
import { listReviewItems, reviewStoreConfigured } from "@/lib/store/review";
import { loadLexicon } from "@/lib/store/lexicon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → every answer-key sentence for the reviewer. */
export async function GET(req: Request) {
  const denied = requireReviewer(req);
  if (denied) return denied;
  if (!reviewStoreConfigured()) return Response.json({ error: "Saving reviews needs BLOB_READ_WRITE_TOKEN" }, { status: 412 });
  const items = await listReviewItems(await loadLexicon());
  return Response.json({ dialect: levantine.dialect, items });
}
