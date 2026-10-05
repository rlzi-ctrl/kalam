"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NativeRecording } from "@/lib/review/match";
import type { Api } from "./useAppApi";

export type NativeClip = { url: string; bytes: ArrayBuffer };

/** Reviewer recordings (the preferred audio in Say it) and a memoised loader for their MP3s. */
export function useNativeAudio(api: Api, enabled: boolean) {
  const [recordings, setRecordings] = useState<NativeRecording[]>([]);
  const memo = useRef(new Map<string, Promise<NativeClip>>());

  useEffect(() => {
    if (!enabled) return;
    api("/api/native-audio")
      .then((r) => r.json())
      .then((j) => setRecordings(j.recordings ?? []))
      .catch(() => setRecordings([]));
  }, [api, enabled]);

  const load = useCallback(
    (id: string): Promise<NativeClip> => {
      let clip = memo.current.get(id);
      if (!clip) {
        clip = (async () => {
          const res = await api(`/api/review/${id}/audio`);
          if (!res.ok) throw new Error(`recording unavailable (HTTP ${res.status})`);
          const bytes = await res.arrayBuffer();
          return { url: URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })), bytes };
        })();
        memo.current.set(id, clip);
        clip.catch(() => memo.current.delete(id));
      }
      return clip;
    },
    [api],
  );

  return { recordings, load };
}
