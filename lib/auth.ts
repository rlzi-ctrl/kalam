import { createHash, timingSafeEqual } from "node:crypto";

export const PASSCODE_HEADER = "x-app-passcode";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Returns a 401 Response when APP_PASSCODE is set and the request doesn't carry it. */
export function requirePasscode(req: Request): Response | null {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return null;
  const given = req.headers.get(PASSCODE_HEADER) ?? "";
  if (timingSafeEqual(digest(given), digest(expected))) return null;
  return Response.json({ error: "passcode required" }, { status: 401 });
}
