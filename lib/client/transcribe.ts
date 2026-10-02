import type { Transcript } from "@/lib/consensus";
import type { ProviderResult } from "@/lib/results";
import type { ProviderInfo } from "@/lib/stt/registry";
import type { Api } from "./useAppApi";

/** Sends the clip to each provider in parallel; onResult fires as each one answers. */
export async function transcribeAll(
  api: Api,
  providers: ProviderInfo[],
  wav: Blob,
  onResult: (providerId: string, result: ProviderResult) => void,
): Promise<Transcript[]> {
  const results = await Promise.all(
    providers.map(async (p): Promise<Transcript | null> => {
      onResult(p.id, { status: "loading" });
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
    }),
  );
  return results.filter((t): t is Transcript => t !== null);
}

export async function postGrade(api: Api, body: Record<string, unknown>) {
  const res = await api("/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, json: await res.json() };
}
