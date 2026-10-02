export interface TtsVoice {
  /** Stable id used in requests and the cache key, e.g. "azure:ar-JO-SanaNeural". */
  id: string;
  label: string;
  provider: "azure" | "elevenlabs";
  /** Env vars that must all be set for this voice to be usable. */
  requiredEnv: string[];
  /** Part of the cache key, so changing the TTS model never serves stale audio. */
  model: string;
  /** Returns MP3 bytes. */
  synthesize(text: string): Promise<Buffer>;
}

export function missingEnv(v: TtsVoice): string[] {
  return v.requiredEnv.filter((k) => !process.env[k]);
}
