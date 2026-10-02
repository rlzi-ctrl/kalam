import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, Buffer>();
vi.mock("@/lib/blob", () => ({
  blobConfigured: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  readBlob: async (p: string) => store.get(p) ?? null,
  writeBlob: async (p: string, body: Buffer) => void store.set(p, body),
  listBlobPaths: async () => [...store.keys()],
  deleteBlob: async (p: string) => void store.delete(p),
}));

const { parseElevenlabsVoices } = await import("@/lib/tts/elevenlabs");
const { speak, ttsCachePath, voiceInfo } = await import("@/lib/tts/registry");

const ENV = ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "AZURE_TTS_VOICES", "ELEVENLABS_API_KEY", "ELEVENLABS_TTS_VOICES", "BLOB_READ_WRITE_TOKEN"];

describe("voice registry", () => {
  afterEach(() => ENV.forEach((k) => delete process.env[k]));

  it("lists the six Azure Levantine voices, unconfigured without keys", () => {
    const info = voiceInfo();
    expect(info.map((v) => v.id)).toEqual([
      "azure:ar-JO-SanaNeural", "azure:ar-JO-TaimNeural", "azure:ar-LB-LaylaNeural",
      "azure:ar-LB-RamiNeural", "azure:ar-SY-AmanyNeural", "azure:ar-SY-LaithNeural",
    ]);
    expect(info[0]).toMatchObject({ label: "Azure ar-JO · Sana", configured: false, missing: ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"] });
  });

  it("adds ElevenLabs voices from ELEVENLABS_TTS_VOICES", () => {
    process.env.ELEVENLABS_API_KEY = "x";
    process.env.ELEVENLABS_TTS_VOICES = "Rania=abc123, Fares=def456";
    const el = voiceInfo().filter((v) => v.provider === "elevenlabs");
    expect(el).toEqual([
      { id: "elevenlabs:abc123", label: "ElevenLabs · Rania", provider: "elevenlabs", configured: true, missing: [] },
      { id: "elevenlabs:def456", label: "ElevenLabs · Fares", provider: "elevenlabs", configured: true, missing: [] },
    ]);
  });

  it("parses voice specs leniently", () => {
    expect(parseElevenlabsVoices(undefined)).toEqual([]);
    expect(parseElevenlabsVoices("onlyId, ,A=b")).toEqual([{ label: "onlyId", voiceId: "onlyId" }, { label: "A", voiceId: "b" }]);
  });
});

describe("TTS cache", () => {
  const voice = (synth: () => Promise<Buffer>) => ({
    id: "azure:ar-JO-SanaNeural", label: "", provider: "azure" as const, requiredEnv: [], model: "neural", synthesize: vi.fn(synth),
  });

  beforeEach(() => store.clear());
  afterEach(() => ENV.forEach((k) => delete process.env[k]));

  it("keys on voice, model and text", () => {
    const a = ttsCachePath({ id: "v1", model: "m" }, "مرحبا");
    expect(a).toMatch(/^tts\/[0-9a-f]{64}\.mp3$/);
    expect(ttsCachePath({ id: "v1", model: "m" }, "مرحبا")).toBe(a);
    expect(ttsCachePath({ id: "v2", model: "m" }, "مرحبا")).not.toBe(a);
    expect(ttsCachePath({ id: "v1", model: "m2" }, "مرحبا")).not.toBe(a);
    expect(ttsCachePath({ id: "v1", model: "m" }, "مرحبا!")).not.toBe(a);
  });

  it("synthesizes once, then serves from the cache", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "x";
    const v = voice(async () => Buffer.from("mp3"));
    expect((await speak(v, "أديمة")).cache).toBe("miss");
    const second = await speak(v, "أديمة");
    expect(second).toEqual({ audio: Buffer.from("mp3"), cache: "hit" });
    expect(v.synthesize).toHaveBeenCalledTimes(1);
  });

  it("still works without Blob, uncached", async () => {
    const v = voice(async () => Buffer.from("mp3"));
    expect((await speak(v, "أديمة")).cache).toBe("disabled");
    expect((await speak(v, "أديمة")).cache).toBe("disabled");
    expect(v.synthesize).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(0);
  });
});
