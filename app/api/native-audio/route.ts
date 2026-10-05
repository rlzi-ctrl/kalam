import { requirePasscode } from "@/lib/auth";
import { currentRecordings } from "@/lib/store/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → reviewer recordings that match their sentence's current key (the preferred audio in Say it). */
export async function GET(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  try {
    return Response.json({ recordings: await currentRecordings() });
  } catch (err) {
    return Response.json({ recordings: [], error: err instanceof Error ? err.message : String(err) });
  }
}
