import { failOnHttpError } from "@/lib/stt/types";
import type { TtsVoice } from "./types";

const model = () => process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";

export function elevenlabsVoice(label: string, voiceId: string): TtsVoice {
  return {
    id: `elevenlabs:${voiceId}`,
    label: `ElevenLabs · ${label}`,
    provider: "elevenlabs",
    requiredEnv: ["ELEVENLABS_API_KEY"],
    get model() {
      return model();
    },
    async synthesize(text) {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({ text, model_id: model() }),
        },
      );
      await failOnHttpError(res, "ElevenLabs TTS");
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

/** ELEVENLABS_TTS_VOICES="Rania=voiceId1,Fares=voiceId2" */
export function parseElevenlabsVoices(spec: string | undefined): { label: string; voiceId: string }[] {
  return (spec ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      return eq > 0
        ? { label: part.slice(0, eq).trim(), voiceId: part.slice(eq + 1).trim() }
        : { label: part, voiceId: part };
    })
    .filter((v) => v.voiceId);
}
