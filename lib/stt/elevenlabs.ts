import { failOnHttpError, wavBlob, type SttProvider } from "./types";

const model = () => process.env.ELEVENLABS_STT_MODEL || "scribe_v1";

export const elevenlabs: SttProvider = {
  id: "elevenlabs",
  get label() {
    return `ElevenLabs Scribe (${model()})`;
  },
  requiredEnv: ["ELEVENLABS_API_KEY"],
  async transcribe({ wav, language }) {
    const form = new FormData();
    form.append("model_id", model());
    form.append("language_code", language);
    form.append("tag_audio_events", "false");
    form.append("file", wavBlob(wav), "clip.wav");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      body: form,
    });
    await failOnHttpError(res, "ElevenLabs");
    const json = (await res.json()) as { text?: string; language_code?: string };
    return { text: json.text?.trim() ?? "", note: json.language_code ? `detected: ${json.language_code}` : undefined };
  },
};
