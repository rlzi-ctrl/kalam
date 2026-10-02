import { requirePasscode } from "@/lib/auth";
import { availableGraderModels, defaultGraderModel } from "@/lib/grader/models";
import { providerInfo } from "@/lib/stt/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  return Response.json({
    providers: providerInfo(),
    grader: {
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      defaultModel: defaultGraderModel(),
      models: availableGraderModels(),
    },
    passcodeEnabled: Boolean(process.env.APP_PASSCODE),
  });
}
