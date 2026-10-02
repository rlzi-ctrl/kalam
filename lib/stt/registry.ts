import { levantine } from "@/lib/langpacks/levantine";
import { azureTranscriber } from "./azure";
import { elevenlabs } from "./elevenlabs";
import { openaiGpt4oTranscribe, openaiWhisper } from "./openai";
import { missingEnv, type SttProvider } from "./types";

function azureLocales(): string[] {
  const fromEnv = process.env.AZURE_SPEECH_LOCALES?.split(",").map((s) => s.trim()).filter(Boolean);
  return fromEnv?.length ? fromEnv : levantine.defaultAzureLocales;
}

export function allProviders(): SttProvider[] {
  return [elevenlabs, openaiGpt4oTranscribe, openaiWhisper, ...azureLocales().map(azureTranscriber)];
}

export function getProvider(id: string): SttProvider | undefined {
  return allProviders().find((p) => p.id === id);
}

export type ProviderInfo = { id: string; label: string; configured: boolean; missing: string[] };

export function providerInfo(): ProviderInfo[] {
  return allProviders().map((p) => {
    const missing = missingEnv(p);
    return { id: p.id, label: p.label, configured: missing.length === 0, missing };
  });
}
