import { createHash, timingSafeEqual } from "node:crypto";

export const PASSCODE_HEADER = "x-app-passcode";
export const REVIEWER_HEADER = "x-reviewer-passcode";

const digest = (s: string) => createHash("sha256").update(s).digest();
const matches = (given: string, expected: string) => timingSafeEqual(digest(given), digest(expected));

/** Returns a 401 Response when APP_PASSCODE is set and the request doesn't carry it. */
export function requirePasscode(req: Request): Response | null {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return null;
  if (matches(req.headers.get(PASSCODE_HEADER) ?? "", expected)) return null;
  return Response.json({ error: "passcode required" }, { status: 401 });
}

/**
 * The reviewer's own passcode (REVIEWER_PASSCODE). Unlike the app passcode it never defaults to open:
 * without it set, reviewer routes are switched off.
 */
export function requireReviewer(req: Request): Response | null {
  const expected = process.env.REVIEWER_PASSCODE;
  if (!expected) return Response.json({ error: "Reviewer access is not set up (REVIEWER_PASSCODE)." }, { status: 503 });
  if (matches(req.headers.get(REVIEWER_HEADER) ?? "", expected)) return null;
  return Response.json({ error: "reviewer passcode required" }, { status: 401 });
}

/** Either the learner (app passcode) or the reviewer. */
export function requireLearnerOrReviewer(req: Request): Response | null {
  const reviewer = process.env.REVIEWER_PASSCODE;
  if (reviewer && matches(req.headers.get(REVIEWER_HEADER) ?? "", reviewer)) return null;
  return requirePasscode(req);
}
