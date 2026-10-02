import { afterEach, describe, expect, it } from "vitest";
import { providerInfo } from "@/lib/stt/registry";

const KEYS = ["ELEVENLABS_API_KEY", "OPENAI_API_KEY", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "AZURE_SPEECH_LOCALES"];

describe("provider registry", () => {
  afterEach(() => KEYS.forEach((k) => delete process.env[k]));

  it("marks providers without keys as not configured", () => {
    const info = providerInfo();
    expect(info.map((p) => p.id)).toEqual([
      "elevenlabs", "openai-gpt-4o-transcribe", "openai-whisper-1", "azure-ar-JO", "azure-ar-LB", "azure-ar-SY",
    ]);
    expect(info.every((p) => !p.configured)).toBe(true);
    expect(info.find((p) => p.id === "azure-ar-JO")?.missing).toEqual(["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"]);
  });

  it("enables providers whose keys are set and honours AZURE_SPEECH_LOCALES", () => {
    process.env.OPENAI_API_KEY = "x";
    process.env.AZURE_SPEECH_KEY = "x";
    process.env.AZURE_SPEECH_REGION = "westeurope";
    process.env.AZURE_SPEECH_LOCALES = "ar-JO";
    const info = providerInfo();
    expect(info.filter((p) => p.configured).map((p) => p.id)).toEqual([
      "openai-gpt-4o-transcribe", "openai-whisper-1", "azure-ar-JO",
    ]);
  });
});
