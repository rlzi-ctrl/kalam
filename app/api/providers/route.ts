import { requirePasscode } from "@/lib/auth";
import { blobConfigured } from "@/lib/blob";
import { availableGraderModels, defaultGraderModel } from "@/lib/grader/models";
import { providerInfo } from "@/lib/stt/registry";
import { voiceInfo } from "@/lib/tts/registry";

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
    voices: voiceInfo(),
    /** Vercel Blob: audio cache + saved cards. */
    storageConfigured: blobConfigured(),
    passcodeEnabled: Boolean(process.env.APP_PASSCODE),
  });
}
