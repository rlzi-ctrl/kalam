"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProviderInfo } from "@/lib/stt/registry";
import type { VoiceInfo } from "@/lib/tts/registry";
import { PASSCODE_KEY, readStored, writeStored } from "./prefs";

export type ModelOption = { id: string; label: string };
export type Meta = {
  providers: ProviderInfo[];
  voices: VoiceInfo[];
  storageConfigured: boolean;
  grader: { configured: boolean; defaultModel: string; models: ModelOption[] };
  passcodeEnabled: boolean;
};
export type Api = (path: string, init?: RequestInit) => Promise<Response>;

export class AuthError extends Error {}

/** Passcode-aware fetch plus the /api/providers metadata every page needs. */
export function useAppApi() {
  const [passcode, setPasscode] = useState("");
  const [needPasscode, setNeedPasscode] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState("");

  const api: Api = useCallback(
    async (path, init = {}) => {
      const headers = new Headers(init.headers);
      if (passcode) headers.set("x-app-passcode", passcode);
      const res = await fetch(path, { ...init, headers });
      if (res.status === 401) {
        setNeedPasscode(true);
        throw new AuthError("passcode required");
      }
      return res;
    },
    [passcode],
  );

  useEffect(() => {
    setPasscode(readStored(PASSCODE_KEY));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api("/api/providers")
      .then((r) => r.json())
      .then((m: Meta) => {
        if (cancelled) return;
        setMeta(m);
        setNeedPasscode(false);
      })
      .catch((err) => {
        if (!cancelled && !(err instanceof AuthError)) setLoadError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const submitPasscode = (value: string) => {
    writeStored(PASSCODE_KEY, value);
    setPasscode(value);
  };

  return { api, meta, loadError, needPasscode, passcodeTried: Boolean(passcode), submitPasscode };
}
