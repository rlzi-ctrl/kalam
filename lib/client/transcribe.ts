import { isAzure, type Transcript } from "@/lib/consensus";
import { serialQueue } from "@/lib/queue";
import type { ProviderResult } from "@/lib/results";
import type { ProviderInfo } from "@/lib/stt/registry";
import type { Api } from "./useAppApi";

/**
 * Sends the clip to each provider; onResult fires as each one answers. Providers run in parallel, except
 * Azure's locales, which go one after another (Azure Speech F0 allows a single concurrent request).
 */
export async function transcribeAll(
  api: Api,
  providers: ProviderInfo[],
  wav: Blob,
  onResult: (providerId: string, result: ProviderResult) => void,
): Promise<Transcript[]> {
  const azureInTurn = serialQueue();
  const results = await Promise.all(
    providers.map(async (p): Promise<Transcript | null> => {
      onResult(p.id, { status: "loading" });
      return isAzure(p.id) ? azureInTurn(() => transcribeOne(api, p, wav, onResult)) : transcribeOne(api, p, wav, onResult);
    }),
  );
  return results.filter((t): t is Transcript => t !== null);
}

async function transcribeOne(
  api: Api,
  p: ProviderInfo,
  wav: Blob,
  onResult: (providerId: string, result: ProviderResult) => void,
): Promise<Transcript | null> {
  let result: ProviderResult;
  try {
    const form = new FormData();
    form.append("provider", p.id);
    form.append("audio", wav, "clip.wav");
    const res = await api("/api/transcribe", { method: "POST", body: form });
    const json = await res.json();
    result = res.ok
      ? { status: "done", text: json.text, note: json.note, ms: json.ms }
      : { status: "error", error: json.error ?? `HTTP ${res.status}`, ms: json.ms };
  } catch (err) {
    result = { status: "error", error: String(err) };
  }
  onResult(p.id, result);
  return result.status === "done" ? { providerId: p.id, label: p.label, text: result.text } : null;
}

export async function postGrade(api: Api, body: Record<string, unknown>) {
  const res = await api("/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, json: await res.json() };
}
