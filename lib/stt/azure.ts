import { failOnHttpError, type SttProvider } from "./types";

// Short-audio REST API (clips up to 60 s), one provider per locale.
export function azureTranscriber(locale: string): SttProvider {
  return {
    id: `azure-${locale}`,
    label: `Azure Speech (${locale})`,
    requiredEnv: ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"],
    async transcribe({ wav }) {
      const region = process.env.AZURE_SPEECH_REGION!;
      const url =
        `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
        `?language=${encodeURIComponent(locale)}&format=simple&profanity=raw`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY!,
          "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
          Accept: "application/json",
        },
        body: new Uint8Array(wav),
      });
      await failOnHttpError(res, "Azure");
      const json = (await res.json()) as { RecognitionStatus?: string; DisplayText?: string };
      if (json.RecognitionStatus !== "Success") {
        return { text: "", note: `RecognitionStatus: ${json.RecognitionStatus}` };
      }
      return { text: json.DisplayText?.trim() ?? "" };
    },
  };
}
