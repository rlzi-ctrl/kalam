import { failOnHttpError, type SttProvider } from "./types";

/**
 * Short-audio REST endpoint for one locale. Throws on a malformed region, since a region like
 * "https://westeurope.api.cognitive.microsoft.com" or one with a stray "?" would silently
 * produce the wrong request.
 */
export function azureShortAudioUrl(region: string, locale: string): string {
  const r = region.trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(r)) {
    throw new Error(`AZURE_SPEECH_REGION must be a bare region name like "westeurope" (got "${region}")`);
  }
  const url = new URL(`https://${r}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`);
  url.searchParams.set("language", locale);
  url.searchParams.set("format", "simple");
  url.searchParams.set("profanity", "raw");
  return url.toString();
}

// Short-audio REST API (clips up to 60 s), one provider per locale.
export function azureTranscriber(locale: string): SttProvider {
  return {
    id: `azure-${locale}`,
    label: `Azure Speech (${locale})`,
    requiredEnv: ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"],
    async transcribe({ wav }) {
      const url = azureShortAudioUrl(process.env.AZURE_SPEECH_REGION!, locale);
      // The key goes in a header, so the URL is safe to log.
      console.info(`[azure-stt] POST ${url} (${wav.length} bytes)`);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY!,
          "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
          Accept: "application/json",
        },
        body: new Uint8Array(wav),
      });
      await failOnHttpError(res, `Azure (${url})`);
      const json = (await res.json()) as { RecognitionStatus?: string; DisplayText?: string };
      console.info(`[azure-stt] ${locale} → ${res.status} ${json.RecognitionStatus}: ${JSON.stringify(json.DisplayText ?? "")}`);
      const note = `request: ${url}`;
      if (json.RecognitionStatus !== "Success") {
        return { text: "", note: `RecognitionStatus: ${json.RecognitionStatus} · ${note}` };
      }
      return { text: json.DisplayText?.trim() ?? "", note };
    },
  };
}
