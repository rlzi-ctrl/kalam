import { fetchWithRetry } from "@/lib/http/retry";
import { failOnHttpError } from "@/lib/stt/types";
import type { TtsVoice } from "./types";

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** e.g. "ar-JO-SanaNeural" → locale "ar-JO". */
export function azureVoice(name: string): TtsVoice {
  const locale = name.split("-").slice(0, 2).join("-");
  const short = name.split("-").slice(2).join("-").replace(/Neural$/, "");
  return {
    id: `azure:${name}`,
    label: `Azure ${locale} · ${short}`,
    provider: "azure",
    requiredEnv: ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"],
    model: "neural",
    async synthesize(text) {
      const ssml =
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
        `<voice name="${name}">${escapeXml(text)}</voice></speak>`;
      // The page queues Azure TTS one request at a time; a 429 that still happens is retried here.
      const res = await fetchWithRetry(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY!,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
          "User-Agent": "kalam",
        },
        body: ssml,
      }, { onRetry: (n, ms) => console.warn(`[azure-tts] ${name} got 429, retry ${n} in ${ms} ms`) });
      await failOnHttpError(res, "Azure TTS");
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
