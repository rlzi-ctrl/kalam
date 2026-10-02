export type TranscribeInput = {
  /** 16 kHz mono 16-bit PCM WAV. */
  wav: Buffer;
  /** ISO 639-1 language code, e.g. "ar". */
  language: string;
};

export type TranscribeResult = { text: string; note?: string };

export interface SttProvider {
  id: string;
  label: string;
  /** Env vars that must all be set for this provider to be usable. */
  requiredEnv: string[];
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
}

export function missingEnv(p: SttProvider): string[] {
  return p.requiredEnv.filter((k) => !process.env[k]);
}

export async function failOnHttpError(res: Response, provider: string): Promise<void> {
  if (res.ok) return;
  const body = (await res.text()).slice(0, 500);
  throw new Error(`${provider} HTTP ${res.status}: ${body}`);
}

export function wavBlob(wav: Buffer): Blob {
  return new Blob([new Uint8Array(wav)], { type: "audio/wav" });
}
