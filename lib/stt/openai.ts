import { failOnHttpError, wavBlob, type SttProvider } from "./types";

function openaiTranscriber(model: string, label: string): SttProvider {
  return {
    id: `openai-${model}`,
    label,
    requiredEnv: ["OPENAI_API_KEY"],
    async transcribe({ wav, language }) {
      const form = new FormData();
      form.append("model", model);
      form.append("language", language);
      form.append("response_format", "json");
      form.append("file", wavBlob(wav), "clip.wav");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });
      await failOnHttpError(res, "OpenAI");
      const json = (await res.json()) as { text?: string };
      return { text: json.text?.trim() ?? "" };
    },
  };
}

export const openaiGpt4oTranscribe = openaiTranscriber("gpt-4o-transcribe", "OpenAI gpt-4o-transcribe");
export const openaiWhisper = openaiTranscriber("whisper-1", "OpenAI whisper-1");
