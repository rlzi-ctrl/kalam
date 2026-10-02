import { createHash } from "node:crypto";
import { blobConfigured, readBlob, writeBlob } from "@/lib/blob";
import { azureVoice } from "./azure";
import { elevenlabsVoice, parseElevenlabsVoices } from "./elevenlabs";
import { missingEnv, type TtsVoice } from "./types";

const DEFAULT_AZURE_VOICES = [
  "ar-JO-SanaNeural",
  "ar-JO-TaimNeural",
  "ar-LB-LaylaNeural",
  "ar-LB-RamiNeural",
  "ar-SY-AmanyNeural",
  "ar-SY-LaithNeural",
];

export function allVoices(): TtsVoice[] {
  const azure = process.env.AZURE_TTS_VOICES?.split(",").map((s) => s.trim()).filter(Boolean);
  return [
    ...(azure?.length ? azure : DEFAULT_AZURE_VOICES).map(azureVoice),
    ...parseElevenlabsVoices(process.env.ELEVENLABS_TTS_VOICES).map((v) => elevenlabsVoice(v.label, v.voiceId)),
  ];
}

export function getVoice(id: string): TtsVoice | undefined {
  return allVoices().find((v) => v.id === id);
}

export type VoiceInfo = { id: string; label: string; provider: string; configured: boolean; missing: string[] };

export function voiceInfo(): VoiceInfo[] {
  return allVoices().map((v) => {
    const missing = missingEnv(v);
    return { id: v.id, label: v.label, provider: v.provider, configured: missing.length === 0, missing };
  });
}

/** Same voice + model + text → same file, so replays never pay for synthesis again. */
export function ttsCachePath(voice: Pick<TtsVoice, "id" | "model">, text: string): string {
  const hash = createHash("sha256").update(`${voice.id}\n${voice.model}\n${text}`).digest("hex");
  return `tts/${hash}.mp3`;
}

export type SpeechResult = { audio: Buffer; cache: "hit" | "miss" | "disabled" };

export async function speak(voice: TtsVoice, text: string): Promise<SpeechResult> {
  if (!blobConfigured()) return { audio: await voice.synthesize(text), cache: "disabled" };
  const path = ttsCachePath(voice, text);
  const cached = await readBlob(path);
  if (cached) return { audio: cached, cache: "hit" };
  const audio = await voice.synthesize(text);
  await writeBlob(path, audio, "audio/mpeg");
  return { audio, cache: "miss" };
}
