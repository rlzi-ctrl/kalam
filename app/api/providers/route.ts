import { requirePasscode } from "@/lib/auth";
import { graderModel } from "@/lib/grader/grade";
import { providerInfo } from "@/lib/stt/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  return Response.json({
    providers: providerInfo(),
    grader: { model: graderModel(), configured: Boolean(process.env.ANTHROPIC_API_KEY) },
    passcodeEnabled: Boolean(process.env.APP_PASSCODE),
  });
}
