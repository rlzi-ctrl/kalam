"use client";

import { useCallback, useEffect, useState } from "react";
import type { Concept, Register } from "@/lib/lexicon";
import type { Api } from "./useAppApi";

export type NewForm = { translit: string; arabic: string; register: Register; tts?: string };

/** The lexicon with the learner's preferences; prefer/add save to the server. */
export function useLexicon(api: Api, enabled = true) {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const res = await api("/api/lexicon");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setConcepts(json.concepts);
      setStorageConfigured(json.storageConfigured);
      setError("");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  }, [api]);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  const post = async (body: Record<string, unknown>): Promise<Concept> => {
    const res = await api("/api/lexicon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    const updated = json.concept as Concept;
    setConcepts((cs) => (cs.some((c) => c.id === updated.id) ? cs.map((c) => (c.id === updated.id ? updated : c)) : [...cs, updated]));
    return updated;
  };

  /** One tap: make this variant the preferred form of its concept. */
  const prefer = (conceptId: string, variantId: string) => post({ action: "prefer", conceptId, variantId });

  /** Adds forms (to a concept, or to a new one named `en`) and optionally prefers one of them. */
  const add = (opts: { conceptId?: string; en?: string; forms: (NewForm & { source?: "generated" | "reviewer" })[]; prefer?: string }) =>
    post({ action: "add", conceptId: opts.conceptId, en: opts.en, variants: opts.forms, prefer: opts.prefer });

  return { concepts, storageConfigured, error, reload, prefer, add };
}
