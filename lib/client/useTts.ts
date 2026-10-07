"use client";

import { useCallback, useRef } from "react";
import { serialQueue } from "@/lib/queue";
import type { Api } from "./useAppApi";

// One queue per browser tab for every Azure TTS request (Voices page, word prefetches, playlists):
// Azure Speech F0 rejects parallel requests with 429. Other providers aren't queued.
const azureInTurn = serialQueue();
const isAzureVoice = (voiceId: string) => voiceId.startsWith("azure:");

export type TtsClip = { url: string; bytes: ArrayBuffer; cache: string; chars: number; ms: number };

/**
 * Fetches speech for (voice, text). The server caches it in Blob; this keeps it in memory too,
 * so replays in the same session make no request at all.
 */
export function useTts(api: Api) {
  const memo = useRef(new Map<string, Promise<TtsClip>>());

  const get = useCallback(
    (voiceId: string, text: string): Promise<TtsClip> => {
      const key = `${voiceId}\n${text}`;
      let clip = memo.current.get(key);
      if (!clip) {
        clip = (async () => {
          const request = () =>
            api("/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ voiceId, text }),
            });
          // Queued until the response is fully read, so the next Azure call starts only after this one.
          const res = isAzureVoice(voiceId)
            ? await azureInTurn(async () => {
                const r = await request();
                const body = await r.arrayBuffer();
                return new Response(body, { status: r.status, headers: r.headers });
              })
            : await request();
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            throw new Error(json.error ?? `HTTP ${res.status}`);
          }
          const bytes = await res.arrayBuffer();
          return {
            url: URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })),
            bytes,
            cache: res.headers.get("X-TTS-Cache") ?? "?",
            chars: Number(res.headers.get("X-TTS-Chars") ?? 0),
            ms: Number(res.headers.get("X-TTS-Ms") ?? 0),
          };
        })();
        memo.current.set(key, clip);
        clip.catch(() => memo.current.delete(key)); // let a failed request be retried
      }
      return clip;
    },
    [api],
  );

  return get;
}
