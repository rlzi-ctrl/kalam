import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeAll } from "@/lib/client/transcribe";
import { fetchWithRetry, retryAfterMs } from "@/lib/http/retry";
import { serialQueue } from "@/lib/queue";
import { providerInfo } from "@/lib/stt/registry";
import { voiceInfo } from "@/lib/tts/registry";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("fetchWithRetry", () => {
  afterEach(() => vi.unstubAllGlobals());

  const responses = (...statuses: (number | [number, Record<string, string>])[]) => {
    const fetchMock = vi.fn(async () => {
      const next = statuses.shift() ?? 200;
      const [status, headers] = Array.isArray(next) ? next : [next, {}];
      return new Response("x", { status, headers });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("retries a 429 with exponential backoff, then returns the success", async () => {
    const fetchMock = responses(429, 429, 200);
    const waits: number[] = [];
    const res = await fetchWithRetry("https://x", {}, { sleep: async (ms) => void waits.push(ms) });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it("follows Retry-After, capped", async () => {
    responses([429, { "retry-after": "3" }], [429, { "retry-after": "120" }], 200);
    const waits: number[] = [];
    await fetchWithRetry("https://x", {}, { sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([3000, 8000]);
  });

  it("gives up after the retries and returns the last 429", async () => {
    const fetchMock = responses(429, 429, 429, 429, 429);
    const res = await fetchWithRetry("https://x", {}, { retries: 2, sleep: async () => {} });
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("doesn't retry other errors", async () => {
    const fetchMock = responses(500, 200);
    expect((await fetchWithRetry("https://x", {}, { sleep: async () => {} })).status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads Retry-After as seconds or a date", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(retryAfterMs("soon")).toBeUndefined();
    expect(retryAfterMs(null)).toBeUndefined();
  });
});

describe("serialQueue", () => {
  it("runs one task at a time, in order, and survives failures", async () => {
    const run = serialQueue();
    const log: string[] = [];
    let active = 0;
    let maxActive = 0;
    const task = (name: string, ms: number, fail = false) => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      log.push(`start ${name}`);
      await delay(ms);
      active--;
      log.push(`end ${name}`);
      if (fail) throw new Error(name);
      return name;
    };
    const results = await Promise.allSettled([run(task("a", 30)), run(task("b", 5, true)), run(task("c", 5))]);
    expect(maxActive).toBe(1);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });
});

describe("transcribeAll", () => {
  it("sends Azure locales one after another and the other providers in parallel", async () => {
    const providers = ["elevenlabs", "openai-whisper-1", "azure-ar-JO", "azure-ar-LB", "azure-ar-SY"].map((id) => ({
      id, label: id, configured: true, missing: [], inConsensus: true, optIn: false,
    }));
    let azureActive = 0;
    let azureMax = 0;
    let othersActive = 0;
    let othersMax = 0;
    const order: string[] = [];
    const api = async (_path: string, init?: RequestInit) => {
      const id = String((init!.body as FormData).get("provider"));
      const azure = id.startsWith("azure-");
      if (azure) azureMax = Math.max(azureMax, ++azureActive);
      else othersMax = Math.max(othersMax, ++othersActive);
      await delay(20);
      if (azure) azureActive--;
      else othersActive--;
      order.push(id);
      return Response.json({ text: "انا", ms: 20 });
    };
    const out = await transcribeAll(api, providers, new Blob(["RIFF"]), () => {});
    expect(out).toHaveLength(5);
    expect(azureMax).toBe(1);
    expect(othersMax).toBe(2);
    expect(order.filter((id) => id.startsWith("azure-"))).toEqual(["azure-ar-JO", "azure-ar-LB", "azure-ar-SY"]);
  });
});

describe("AZURE_STT_ENABLED", () => {
  afterEach(() => {
    delete process.env.AZURE_STT_ENABLED;
  });

  it("=false removes Azure from speech-to-text but keeps the Azure voices", () => {
    process.env.AZURE_STT_ENABLED = "false";
    expect(providerInfo().some((p) => p.id.startsWith("azure-"))).toBe(false);
    expect(voiceInfo().filter((v) => v.provider === "azure")).toHaveLength(6);
  });

  it("is on by default (and for anything but 'false')", () => {
    expect(providerInfo().filter((p) => p.id.startsWith("azure-"))).toHaveLength(3);
    process.env.AZURE_STT_ENABLED = "true";
    expect(providerInfo().filter((p) => p.id.startsWith("azure-"))).toHaveLength(3);
    process.env.AZURE_STT_ENABLED = " FALSE ";
    expect(providerInfo().filter((p) => p.id.startsWith("azure-"))).toHaveLength(0);
  });
});
